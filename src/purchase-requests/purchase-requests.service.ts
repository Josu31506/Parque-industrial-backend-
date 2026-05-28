import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AvailabilityType, FundsStatus, OrderStatus, PaymentStatus, Prisma, PurchaseRequestGroupStatus, PurchaseRequestStatus, Role, SaleStatus } from '@prisma/client';
import { CommissionService } from '../commission/commission.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentStrategyService } from '../payments/payment-strategy.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfirmPurchaseRequestGroupDto } from './dto/confirm-purchase-request-group.dto';
import { PayPurchaseRequestDto } from './dto/pay-purchase-request.dto';
import { RejectPurchaseRequestGroupDto } from './dto/reject-purchase-request-group.dto';
import { DeliveryDateCalculator } from './delivery-date-calculator.service';
import { PurchaseRequestFactory } from './purchase-request.factory';
import { PurchaseRequestStatusService } from './purchase-request-status.service';

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: PurchaseRequestFactory,
    private readonly statusService: PurchaseRequestStatusService,
    private readonly deliveryDateCalculator: DeliveryDateCalculator,
    private readonly paymentStrategy: PaymentStrategyService,
    private readonly commissionService: CommissionService,
    private readonly notifications: NotificationsService,
  ) {}

  async createFromCart(customerId: string) {
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId: customerId },
      include: { product: true },
    });

    const requestItems = cartItems.filter((item) => item.product.availabilityType !== AvailabilityType.IN_STOCK);
    if (!requestItems.length) {
      throw new BadRequestException('No hay productos bajo pedido para solicitar compra.');
    }
    if (requestItems.some((item) => item.product.availabilityType === AvailabilityType.CUSTOM_QUOTE)) {
      throw new BadRequestException('Los productos CUSTOM_QUOTE deben ir por flujo de cotizacion.');
    }

    const data = this.factory.buildFromCart(customerId, requestItems);
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseRequest.create({
        data: {
          customerId: data.customerId,
          deliveryDays: data.deliveryDays,
          total: data.total,
          items: { create: data.items },
          groups: { create: data.groups },
        },
        include: { items: true, groups: true },
      });
      await tx.cartItem.deleteMany({ where: { id: { in: requestItems.map((item) => item.id) } } });
      return created;
    });

    await this.notifications.createForUser(customerId, 'Solicitud enviada', 'Tu solicitud fue enviada a los productores.', 'PURCHASE_REQUEST', request.id);
    await this.notifications.createForRole(Role.SELLER, 'Nueva solicitud de venta', 'Tienes una solicitud pendiente de confirmacion.', 'PURCHASE_REQUEST', request.id);

    return request;
  }

  findMy(customerId: string) {
    return this.prisma.purchaseRequest.findMany({
      where: { customerId },
      include: { items: { include: { product: true, producer: true } }, groups: { include: { producer: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actor: { sub: string; role: string }) {
    const request = await this.prisma.purchaseRequest.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { product: true, producer: true } }, groups: { include: { producer: true } } },
    });
    if (actor.role === Role.CLIENT && request.customerId !== actor.sub) {
      throw new ForbiddenException('No puedes ver esta solicitud.');
    }
    return request;
  }

  async cancel(id: string, customerId: string) {
    const request = await this.prisma.purchaseRequest.findUniqueOrThrow({ where: { id } });
    if (request.customerId !== customerId) throw new ForbiddenException('No puedes cancelar esta solicitud.');

    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: PurchaseRequestStatus.CANCELLED },
    });
  }

  async continueConfirmed(id: string, customerId: string) {
    const request = await this.findOne(id, { sub: customerId, role: Role.CLIENT });
    const confirmedGroups = request.groups.filter((group) => group.status === PurchaseRequestGroupStatus.CONFIRMED);
    if (!confirmedGroups.length) throw new BadRequestException('No hay grupos confirmados.');

    const confirmedProducerIds = confirmedGroups.map((group) => group.producerId);
    const total = request.items
      .filter((item) => confirmedProducerIds.includes(item.producerId))
      .reduce((sum, item) => sum + Number(item.totalPrice), 0);

    return this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: PurchaseRequestStatus.READY_TO_PAY,
        total: new Prisma.Decimal(total),
      },
    });
  }

  async confirmGroup(groupId: string, sellerId: string, dto: ConfirmPurchaseRequestGroupDto) {
    const group = await this.ensureSellerOwnsGroup(groupId, sellerId);
    const updatedGroup = await this.prisma.purchaseRequestGroup.update({
      where: { id: groupId },
      data: {
        status: PurchaseRequestGroupStatus.CONFIRMED,
        readyDate: dto.readyDate,
        observation: dto.observation,
      },
    });
    await this.refreshRequestStatus(group.purchaseRequestId);
    return updatedGroup;
  }

  async rejectGroup(groupId: string, sellerId: string, dto: RejectPurchaseRequestGroupDto) {
    const group = await this.ensureSellerOwnsGroup(groupId, sellerId);
    const updatedGroup = await this.prisma.purchaseRequestGroup.update({
      where: { id: groupId },
      data: {
        status: PurchaseRequestGroupStatus.REJECTED,
        observation: dto.observation,
      },
    });
    await this.refreshRequestStatus(group.purchaseRequestId);
    return updatedGroup;
  }

  async pay(id: string, customerId: string, dto: PayPurchaseRequestDto) {
    const request = await this.prisma.purchaseRequest.findUniqueOrThrow({
      where: { id },
      include: { items: true, groups: true },
    });
    if (request.customerId !== customerId) throw new ForbiddenException('No puedes pagar esta solicitud.');
    if (request.status !== PurchaseRequestStatus.READY_TO_PAY) throw new BadRequestException('La solicitud no esta lista para pago.');

    const payment = this.paymentStrategy.calculate(Number(request.total), dto.paymentOption);
    const confirmedGroups = request.groups.filter((group) => group.status === PurchaseRequestGroupStatus.CONFIRMED);
    const confirmedProducerIds = confirmedGroups.map((group) => group.producerId);
    const confirmedItems = request.items.filter((item) => confirmedProducerIds.includes(item.producerId));

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          customerId,
          purchaseRequestId: request.id,
          total: request.total,
          paymentOption: dto.paymentOption,
          paidAmount: new Prisma.Decimal(payment.paidAmount),
          remainingAmount: new Prisma.Decimal(payment.remainingAmount),
          paymentStatus: payment.paymentStatus,
          fundsStatus: FundsStatus.HELD,
          status: payment.paymentStatus === PaymentStatus.PARTIALLY_PAID ? OrderStatus.PAYMENT_PARTIAL : OrderStatus.PAYMENT_COMPLETED,
          estimatedDeliveryDate: request.estimatedDeliveryDate,
          items: {
            create: confirmedItems.map((item) => ({
              productId: item.productId,
              producerId: item.producerId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          },
        },
      });

      for (const group of confirmedGroups) {
        const saleItems = confirmedItems.filter((item) => item.producerId === group.producerId);
        const gross = saleItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
        const commission = await this.commissionService.calculateCommission(gross);

        await tx.sale.create({
          data: {
            orderId: createdOrder.id,
            producerId: group.producerId,
            grossAmount: new Prisma.Decimal(gross),
            commissionAmount: new Prisma.Decimal(commission.commissionAmount),
            netAmount: new Prisma.Decimal(commission.netAmount),
            paymentStatus: payment.paymentStatus,
            fundsStatus: FundsStatus.HELD,
            status: SaleStatus.NEW_SALE,
            readyDate: group.readyDate,
            items: {
              create: saleItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.totalPrice,
              })),
            },
          },
        });
      }

      await tx.purchaseRequest.update({
        where: { id },
        data: { status: PurchaseRequestStatus.CONVERTED_TO_ORDER },
      });

      return createdOrder;
    });

    await this.notifications.createForUser(customerId, 'Pago registrado', 'Tu pedido fue creado y el pago queda retenido por la plataforma.', 'ORDER', order.id);
    await this.notifications.createForRole(Role.SELLER, 'Nueva venta confirmada', 'Tienes una nueva venta por preparar.', 'SALE', order.id);

    return order;
  }

  private async ensureSellerOwnsGroup(groupId: string, sellerId: string) {
    const group = await this.prisma.purchaseRequestGroup.findUniqueOrThrow({
      where: { id: groupId },
      include: { producer: true },
    });
    if (group.producer.userId !== sellerId) throw new ForbiddenException('No puedes gestionar este grupo.');
    return group;
  }

  private async refreshRequestStatus(purchaseRequestId: string) {
    const request = await this.prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: purchaseRequestId },
      include: { groups: true },
    });
    const status = this.statusService.calculate(request.groups.map((group) => group.status));
    const readyDates = request.groups
      .filter((group) => group.status === PurchaseRequestGroupStatus.CONFIRMED && group.readyDate)
      .map((group) => group.readyDate as Date);
    const estimatedDeliveryDate = status === PurchaseRequestStatus.READY_TO_PAY
      ? this.deliveryDateCalculator.calculate(readyDates, request.deliveryDays)
      : null;

    const updated = await this.prisma.purchaseRequest.update({
      where: { id: purchaseRequestId },
      data: { status, estimatedDeliveryDate },
    });

    if (status === PurchaseRequestStatus.READY_TO_PAY) {
      await this.notifications.createForUser(request.customerId, 'Solicitud lista para pago', 'Todos los productores confirmaron disponibilidad.', 'PURCHASE_REQUEST', request.id);
    }

    return updated;
  }
}
