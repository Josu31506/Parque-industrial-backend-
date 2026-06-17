import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, QuoteStatus, Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { SmallPaginationQueryDto } from '../common/dto/small-pagination-query.dto';
import { getPagination, paginatedResponse } from '../common/utils/pagination';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuoteResolutionDto } from './dto/quote-resolution.dto';
import { RespondQuoteDto } from './dto/respond-quote.dto';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async create(customerId: string, dto: CreateQuoteDto) {
    const product = dto.productId
      ? await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { producerId: true },
      })
      : null;

    const quote = await this.prisma.quoteRequest.create({
      data: {
        ...dto,
        customerId,
        producerId: product?.producerId,
        referenceImages: dto.referenceImages ?? Prisma.JsonNull,
      },
    });
    return quote;
  }

  async my(customerId: string, query: SmallPaginationQueryDto) {
    const endTimer = this.startDevTimer('quotes-findMy');
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const where: Prisma.QuoteRequestWhereInput = { customerId };

    try {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.quoteRequest.findMany({
          where,
          include: { resolutions: true },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.quoteRequest.count({ where }),
      ]);

      return paginatedResponse(items, total, page, limit);
    } finally {
      endTimer();
    }
  }

  async findAll(query: SmallPaginationQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quoteRequest.findMany({
        include: { customer: { select: this.safeCustomerSelect() }, resolutions: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quoteRequest.count(),
    ]);

    return paginatedResponse(items, total, page, limit);
  }

  async findImageQuotes(query: SmallPaginationQueryDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const where: Prisma.QuoteRequestWhereInput = { type: 'REFERENCE_IMAGE' };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.quoteRequest.findMany({
        where,
        include: { customer: { select: this.safeCustomerSelect() }, resolutions: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quoteRequest.count({ where }),
    ]);

    return paginatedResponse(items, total, page, limit);
  }

  async findSellerQuotes(sellerId: string, query: SmallPaginationQueryDto) {
    const endTimer = this.startDevTimer('quotes-findSeller');
    try {
      const producer = await this.prisma.producer.findUniqueOrThrow({
        where: { userId: sellerId },
        select: { id: true },
      });
      const { page, limit, skip } = getPagination(query.page, query.limit);
      const where: Prisma.QuoteRequestWhereInput = {
        type: 'PRODUCT_BASED',
        OR: [
          { producerId: producer.id },
          { product: { producerId: producer.id } },
        ],
      };

      const [items, total] = await this.prisma.$transaction([
        this.prisma.quoteRequest.findMany({
          where,
          select: {
            id: true,
            customerId: true,
            type: true,
            productId: true,
            status: true,
            quotedPrice: true,
            quotedDeliveryDays: true,
            sellerComment: true,
            validUntil: true,
            title: true,
            description: true,
            quantity: true,
            requestedDimensions: true,
            requestedMaterial: true,
            requestedColor: true,
            requestedFinish: true,
            deliveryDistrict: true,
            referenceImages: true,
            createdAt: true,
            updatedAt: true,
            customer: { select: this.safeCustomerSelect() },
            product: {
              select: {
                id: true,
                title: true,
                producerId: true,
                producer: { select: { id: true, businessName: true } },
              },
            },
            resolutions: {
              select: {
                id: true,
                quoteRequestId: true,
                producerId: true,
                finalTitle: true,
                finalDescription: true,
                finalPrice: true,
                deliveryTime: true,
                notes: true,
                validUntil: true,
                createdAt: true,
              },
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.quoteRequest.count({ where }),
      ]);

      return paginatedResponse(items, total, page, limit);
    } finally {
      endTimer();
    }
  }

  async findOne(id: string, actor: { sub: string; role: string }) {
    const quote = await this.prisma.quoteRequest.findUniqueOrThrow({
      where: { id },
      include: { resolutions: true, customer: { select: this.safeCustomerSelect() }, product: true },
    });

    if (actor.role === Role.CLIENT && quote.customerId !== actor.sub) {
      throw new ForbiddenException('No puedes ver esta cotizacion.');
    }

    if (actor.role === Role.ADVISOR && quote.type !== 'REFERENCE_IMAGE') {
      throw new ForbiddenException('Los asesores solo pueden ver cotizaciones por imagen.');
    }

    return quote;
  }

  async updateStatus(id: string, status: QuoteStatus, actor: { sub: string; role: string }) {
    await this.ensureAdvisorCanManageQuote(id, actor);
    return this.prisma.quoteRequest.update({ where: { id }, data: { status } });
  }

  async addResolution(id: string, dto: QuoteResolutionDto, actor: { sub: string; role: string }) {
    await this.ensureAdvisorCanManageQuote(id, actor);
    await this.ensureProducerCanResolveQuote(id, dto.producerId);
    const resolution = await this.prisma.quoteResolution.create({
      data: {
        quoteRequestId: id,
        producerId: dto.producerId,
        finalTitle: dto.finalTitle,
        finalDescription: dto.finalDescription,
        finalPrice: new Prisma.Decimal(dto.finalPrice),
        deliveryTime: dto.deliveryTime,
        notes: dto.notes,
        validUntil: dto.validUntil,
      },
    });
    const quote = await this.prisma.quoteRequest.update({
      where: { id },
      data: {
        status: QuoteStatus.RESOLUTION_SENT,
        producerId: dto.producerId,
        quotedPrice: new Prisma.Decimal(dto.finalPrice),
        quotedDeliveryDays: this.parseDeliveryDays(dto.deliveryTime),
        sellerComment: dto.notes,
        validUntil: dto.validUntil,
      },
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    void this.mail.sendQuoteResolvedEmail({
      to: quote.customer.email,
      customerName: quote.customer.name,
      quoteId: quote.id,
      quoteTitle: quote.title,
      finalTitle: resolution.finalTitle,
      finalPrice: String(resolution.finalPrice),
      deliveryTime: resolution.deliveryTime,
      notes: resolution.notes,
      quoteUrl: this.frontendUrl('/quotes'),
    }).catch((error) => console.error('No se pudo enviar correo de cotizacion resuelta.', error));
    return resolution;
  }

  async respond(id: string, dto: RespondQuoteDto, sellerId: string) {
    const producer = await this.prisma.producer.findUniqueOrThrow({
      where: { userId: sellerId },
      select: { id: true, businessName: true },
    });
    const quote = await this.prisma.quoteRequest.findUniqueOrThrow({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, title: true, producerId: true } },
      },
    });

    if (quote.type !== 'PRODUCT_BASED') {
      throw new ForbiddenException('Solo puedes responder cotizaciones basadas en tus productos.');
    }

    if ((quote.producerId ?? quote.product?.producerId) !== producer.id) {
      throw new ForbiddenException('Esta cotizacion pertenece a otra productora.');
    }

    const respondableStatuses: QuoteStatus[] = [
      QuoteStatus.PENDING_REVIEW,
      QuoteStatus.IN_COORDINATION,
      QuoteStatus.CONSULTING_PRODUCER,
    ];
    if (!respondableStatuses.includes(quote.status)) {
      throw new BadRequestException('Esta cotizacion ya fue respondida o no puede modificarse.');
    }

    const updated = await this.prisma.quoteRequest.update({
      where: { id },
      data: {
        status: QuoteStatus.ANSWERED,
        producerId: producer.id,
        quotedPrice: new Prisma.Decimal(dto.quotedPrice),
        quotedDeliveryDays: dto.quotedDeliveryDays,
        sellerComment: dto.sellerComment,
        validUntil: dto.validUntil,
      },
      include: {
        customer: { select: this.safeCustomerSelect() },
        product: { include: { producer: true } },
        resolutions: true,
      },
    });

    void this.mail.sendQuoteResolvedEmail({
      to: quote.customer.email,
      customerName: quote.customer.name,
      quoteId: quote.id,
      quoteTitle: quote.title,
      finalTitle: quote.product?.title ?? quote.title,
      finalPrice: dto.quotedPrice,
      deliveryTime: `${dto.quotedDeliveryDays} dias`,
      notes: dto.sellerComment,
      quoteUrl: this.frontendUrl('/quotes'),
    }).catch((error) => console.error('No se pudo enviar correo de cotizacion respondida.', error));

    return updated;
  }

  async addToCart(id: string, customerId: string) {
    const quote = await this.prisma.quoteRequest.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        customerId: true,
        title: true,
        status: true,
        quotedPrice: true,
        validUntil: true,
        product: { select: { title: true } },
      },
    });

    if (quote.customerId !== customerId) {
      throw new ForbiddenException('No puedes agregar esta cotizacion al carrito.');
    }

    const allowedStatuses: QuoteStatus[] = [QuoteStatus.ANSWERED, QuoteStatus.RESOLUTION_SENT, QuoteStatus.ADDED_TO_CART];
    if (!allowedStatuses.includes(quote.status)) {
      throw new BadRequestException('La cotizacion aun no esta lista para agregar al carrito.');
    }

    if (!quote.quotedPrice) {
      throw new BadRequestException('La cotizacion no tiene precio confirmado.');
    }

    if (quote.validUntil && quote.validUntil < new Date()) {
      throw new BadRequestException('La cotizacion ya vencio.');
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.cartItem.upsert({
        where: { userId_quoteId: { userId: customerId, quoteId: id } },
        create: {
          userId: customerId,
          quoteId: id,
          titleSnapshot: quote.product?.title ?? quote.title,
          quotedPriceSnapshot: quote.quotedPrice,
          quantity: 1,
        },
        update: { quantity: { increment: 1 } },
        include: {
          quote: {
            include: {
              product: { include: { producer: true } },
              producer: true,
            },
          },
        },
      });

      await tx.quoteRequest.update({
        where: { id },
        data: { status: QuoteStatus.ADDED_TO_CART, convertedToCartAt: new Date() },
      });

      return item;
    });
  }

  private frontendUrl(path: string) {
    const baseUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }

  private async ensureProducerCanResolveQuote(quoteId: string, producerId: string) {
    const quote = await this.prisma.quoteRequest.findUniqueOrThrow({
      where: { id: quoteId },
      include: { product: { select: { producerId: true } } },
    });

    if (quote.type === 'PRODUCT_BASED' && quote.product?.producerId !== producerId) {
      throw new ForbiddenException('Esta cotizacion pertenece a otra productora.');
    }
  }

  private async ensureAdvisorCanManageQuote(quoteId: string, actor: { sub: string; role: string }) {
    if (actor.role !== Role.ADVISOR) return;
    const quote = await this.prisma.quoteRequest.findUniqueOrThrow({
      where: { id: quoteId },
      select: { type: true },
    });

    if (quote.type !== 'REFERENCE_IMAGE') {
      throw new ForbiddenException('Los asesores solo pueden gestionar cotizaciones por imagen.');
    }
  }

  private safeCustomerSelect() {
    return {
      id: true,
      name: true,
      email: true,
      phone: true,
    } satisfies Prisma.UserSelect;
  }

  private parseDeliveryDays(value: string) {
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  private startDevTimer(label: string) {
    if (process.env.NODE_ENV === 'production') return () => undefined;
    const startedAt = performance.now();
    return () => {
      const duration = performance.now() - startedAt;
      console.log(`${label}: ${duration.toFixed(3)}ms`);
    };
  }
}
