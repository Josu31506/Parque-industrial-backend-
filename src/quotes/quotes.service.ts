import { Injectable } from '@nestjs/common';
import { Prisma, QuoteStatus, Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QuoteResolutionDto } from './dto/quote-resolution.dto';

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async create(customerId: string, dto: CreateQuoteDto) {
    const quote = await this.prisma.quoteRequest.create({
      data: {
        ...dto,
        customerId,
        referenceImages: dto.referenceImages ?? Prisma.JsonNull,
      },
    });
    await this.notifications.createForRole(Role.ADVISOR, 'Nueva cotizacion', 'Un cliente solicito una cotizacion.', 'QUOTE', quote.id);
    return quote;
  }

  my(customerId: string) {
    return this.prisma.quoteRequest.findMany({ where: { customerId }, include: { resolutions: true }, orderBy: { createdAt: 'desc' } });
  }

  findAll() {
    return this.prisma.quoteRequest.findMany({ include: { customer: true, resolutions: true }, orderBy: { createdAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.quoteRequest.findUniqueOrThrow({ where: { id }, include: { resolutions: true, customer: true, product: true } });
  }

  updateStatus(id: string, status: QuoteStatus) {
    return this.prisma.quoteRequest.update({ where: { id }, data: { status } });
  }

  async addResolution(id: string, dto: QuoteResolutionDto) {
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
      data: { status: QuoteStatus.RESOLUTION_SENT },
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    await this.notifications.createForUser(
      quote.customerId,
      'Cotizacion respondida',
      'Ya tenemos una respuesta para tu cotizacion.',
      'QUOTE',
      quote.id,
    );
    void this.mail.sendQuoteResolvedEmail({
      to: quote.customer.email,
      customerName: quote.customer.name,
      quoteTitle: quote.title,
      quoteUrl: this.frontendUrl('/quotes'),
    });
    return resolution;
  }

  addToCart(id: string) {
    return this.prisma.quoteRequest.update({ where: { id }, data: { status: QuoteStatus.ADDED_TO_CART } });
  }

  private frontendUrl(path: string) {
    const baseUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }
}
