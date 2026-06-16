import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AvailabilityType, FundsStatus, OrderStatus, PaymentStatus, Prisma, PurchaseRequestGroupStatus, PurchaseRequestStatus, Role, SaleStatus } from '@prisma/client';
import { CommissionService } from '../commission/commission.service';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { getPagination, paginatedResponse } from '../common/utils/pagination';
import { MailService } from '../mail/mail.service';
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
    private readonly mail: MailService,
  ) {}

  async createFromCart(customerId: string) {
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId: customerId },
      include: { product: true },
    });

    const requestItems = cartItems.filter((item) =>
      item.product.requiresConfirmation
      || item.product.availabilityType === AvailabilityType.MADE_TO_ORDER,
    );
    if (!requestItems.length) {
      throw new BadRequestException('No hay productos que requieran confirmacion para solicitar compra.');
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

    return request;
  }

  async findMy(customerId: string, query: SmallPaginationQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const where: Prisma.PurchaseRequestWhereInput = { customerId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.findMany({
        where,
        include: { items: { include: { product: true, producer: true } }, groups: { include: { producer: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);

    return paginatedResponse(items, total, page, limit);
  }

  async findForSeller(sellerId: string, query: SmallPaginationQueryDto) {
    const producer = await this.prisma.producer.findUniqueOrThrow({
      where: { userId: sellerId },
      select: { id: true },
    });
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const where: Prisma.PurchaseRequestGroupWhereInput = { producerId: producer.id };

    const [groups, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequestGroup.findMany({
        where,
        include: {
          purchaseRequest: {
            include: {
              items: {
                where: { producerId: producer.id },
                include: { product: { select: { title: true, dimensions: true, materials: true, colors: true, finish: true } } },
              },
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseRequestGroup.count({ where }),
    ]);

    const items = groups.flatMap((group) =>
      group.purchaseRequest.items.map((item) => ({
        groupId: group.id,
        producerId: group.producerId,
        productTitle: item.product?.title ?? 'Producto no disponible',
        quantity: item.quantity,
        status: group.status,
        deliveryDistrict: null,
        requestedAt: group.purchaseRequest.createdAt,
        notes: group.observation ?? null,
        estimatedReadyDate: group.readyDate,
        sellerComment: group.observation ?? null,
        productDetails: {
          dimensions: item.product?.dimensions ?? null,
          materials: item.product?.materials ?? null,
          colors: item.product?.colors ?? null,
          finish: item.product?.finish ?? null,
        },
      })),
    );

    return paginatedResponse(items, total, page, limit);
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
    const readyDate = dto.estimatedReadyDate ?? dto.readyDate;
    if (!readyDate) throw new BadRequestException('La fecha estimada es obligatoria.');
    const observation = dto.sellerComment ?? dto.observation;
    const updatedGroup = await this.prisma.purchaseRequestGroup.update({
      where: { id: groupId },
      data: {
        status: PurchaseRequestGroupStatus.CONFIRMED,
        readyDate,
        observation,
      },
    });
    await this.refreshRequestStatus(group.purchaseRequestId);
    await this.notifyCustomerAboutGroupConfirmation(groupId, true, readyDate, observation);
    return updatedGroup;
  }

  async rejectGroup(groupId: string, sellerId: string, dto: RejectPurchaseRequestGroupDto) {
    const group = await this.ensureSellerOwnsGroup(groupId, sellerId);
    const reason = dto.reason ?? dto.observation;
    const updatedGroup = await this.prisma.purchaseRequestGroup.update({
      where: { id: groupId },
      data: {
        status: PurchaseRequestGroupStatus.REJECTED,
        observation: reason,
      },
    });
    await this.refreshRequestStatus(group.purchaseRequestId);
    await this.notifyCustomerAboutGroupConfirmation(groupId, false, null, reason);
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

    this.sendOrderConfirmedEmailInBackground(order.id);

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

  private async notifyCustomerAboutGroupConfirmation(
    groupId: string,
    confirmed: boolean,
    readyDate?: Date | null,
    sellerComment?: string | null,
  ) {
    const group = await this.prisma.purchaseRequestGroup.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        purchaseRequest: {
          include: { customer: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    const items = await this.prisma.purchaseRequestItem.findMany({
      where: { purchaseRequestId: group.purchaseRequestId, producerId: group.producerId },
      include: { product: true, producer: true },
    });
    const productName = items.map((item) => item.product.title).join(', ') || 'Producto solicitado';
    const customer = group.purchaseRequest.customer;
    const mailItems = items.map((item) => ({
      title: item.product.title,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      totalPrice: String(item.totalPrice),
      producerName: item.producer.businessName,
    }));

    if (confirmed) {
      void this.mail.sendPurchaseRequestConfirmedEmail({
        to: customer.email,
        customerName: customer.name,
        requestId: group.purchaseRequestId,
        items: mailItems,
        productName,
        estimatedReadyDate: readyDate,
        sellerComment,
      }).catch((error) => console.error('No se pudo enviar correo de solicitud confirmada.', error));
      return;
    }

    void this.mail.sendPurchaseRequestRejectedEmail({
      to: customer.email,
      customerName: customer.name,
      requestId: group.purchaseRequestId,
      items: mailItems,
      productName,
      reason: sellerComment,
    }).catch((error) => console.error('No se pudo enviar correo de solicitud rechazada.', error));
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

    return updated;
  }

  private async getOrderEmailSummary(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        estimatedDeliveryDate: true,
        total: true,
        customer: { select: { name: true, email: true } },
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            product: { select: { title: true } },
            producer: { select: { businessName: true } },
          },
        },
      },
    });

    return {
      to: order.customer.email,
      customerName: order.customer.name,
      orderId: order.id,
      orderNumber: order.orderNumber,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      total: String(order.total),
      items: order.items.map((item) => ({
        title: item.product.title,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        totalPrice: String(item.totalPrice),
        producerName: item.producer.businessName,
      })),
    };
  }

  private sendOrderConfirmedEmailInBackground(orderId: string) {
    void this.getOrderEmailSummary(orderId)
      .then((summary) => this.mail.sendOrderStatusChangedEmail({
        ...summary,
        statusLabel: 'Pedido confirmado',
        title: 'Pedido confirmado',
        intro: 'Tu pedido fue registrado correctamente y el pago quedará retenido por la plataforma hasta la entrega conforme.',
      }))
      .catch((error) => console.error('No se pudo enviar correo de pedido confirmado.', error));
  }
}
