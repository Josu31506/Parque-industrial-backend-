import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type MailProductItem = {
  title: string;
  quantity: number;
  unitPrice?: number | string;
  totalPrice?: number | string;
  producerName?: string;
};

type TemplateOptions = {
  title: string;
  intro: string;
  preheader?: string;
  badge?: string;
  codeLabel?: string;
  codeValue?: string;
  paragraphs?: string[];
  sections?: Array<{ title: string; body: string | string[] }>;
  items?: MailProductItem[];
  summary?: Array<{ label: string; value: string }>;
  ctaLabel?: string;
  ctaUrl?: string;
};

type PurchaseRequestEmailParams = {
  to: string;
  customerName: string;
  requestId?: string;
  items?: MailProductItem[];
  productSummary?: string;
  productName?: string;
  readyDate?: string | Date | null;
  estimatedReadyDate?: string | Date | null;
  sellerComment?: string | null;
  reason?: string | null;
  paymentUrl?: string;
};

type MailUserRole = 'CLIENT' | 'SELLER' | 'ADVISOR' | 'ADMIN';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  async sendMail(options: MailMessage): Promise<void> {
    try {
      await this.sendMailOrThrow(options);
    } catch (error) {
      this.logger.error(
        `No se pudo enviar correo a ${options.to}: ${options.subject}`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      const transporter = this.getTransporter();
      if (!transporter) return false;

      await transporter.verify();
      this.logger.log('Conexion SMTP verificada correctamente.');
      return true;
    } catch (error) {
      this.logger.error(
        'No se pudo verificar la conexion SMTP.',
        error instanceof Error ? error.message : undefined,
      );
      return false;
    }
  }

  async sendTestEmail(to: string): Promise<void> {
    await this.sendMailOrThrow({
      to,
      subject: 'Prueba de correo - Parque Industrial Conecta',
      text: 'Este es un correo de prueba para verificar Gmail SMTP en Parque Industrial Conecta.',
      html: this.renderTemplate({
        title: 'Prueba de correo',
        intro: 'Gmail SMTP está configurado correctamente para Parque Industrial Conecta.',
        paragraphs: [
          'Este mensaje confirma que el backend puede enviar correos desde la configuración local.',
        ],
      }),
    });
  }

  async sendInvitationEmail(params: {
    to: string;
    role: 'SELLER' | 'ADVISOR' | 'ADMIN';
    invitationUrl: string;
    producerName?: string;
    expiresAt?: string | Date | null;
  }): Promise<void> {
    const roleLabel = params.role === 'SELLER'
      ? 'Trabajador/Productor'
      : params.role === 'ADVISOR'
        ? 'Asesor'
        : 'Administrador';
    await this.sendMail({
      to: params.to,
      subject: 'Invitacion a Parque Industrial Conecta',
      text: [
        `Has sido invitado a Parque Industrial Conecta con el rol: ${roleLabel}.`,
        `Correo invitado: ${params.to}`,
        params.producerName ? `Productora asociada: ${params.producerName}` : '',
        params.expiresAt ? `Vence: ${this.formatDate(params.expiresAt)}` : '',
        `Completa tu registro en el siguiente enlace: ${params.invitationUrl}`,
      ].filter(Boolean).join('\n'),
      html: this.renderTemplate({
        title: 'Invitacion a Parque Industrial Conecta',
        preheader: 'Completa tu registro para acceder a la plataforma.',
        badge: roleLabel,
        intro: `Has sido invitado a Parque Industrial Conecta con el rol: ${roleLabel}.`,
        codeLabel: 'Correo invitado',
        codeValue: params.to,
        paragraphs: [
          params.producerName ? `Productora asociada: ${params.producerName}` : '',
          params.expiresAt ? `Vence: ${this.formatDate(params.expiresAt)}` : '',
          'Completa tu registro en el siguiente enlace. No se ha generado ninguna contraseña temporal.',
        ].filter(Boolean),
        ctaLabel: 'Aceptar invitacion',
        ctaUrl: params.invitationUrl,
      }),
    });
  }

  async sendPurchaseRequestConfirmedEmail(params: PurchaseRequestEmailParams): Promise<void> {
    const productSummary = params.productSummary ?? params.productName ?? 'Producto solicitado';
    const requestCode = params.requestId ? this.formatRequestCode(params.requestId) : 'SOLICITUD';
    const date = this.formatDate(params.readyDate ?? params.estimatedReadyDate);
    const comment = params.sellerComment || 'La productora confirmó disponibilidad.';
    const paymentUrl = params.paymentUrl ?? this.frontendUrl('/purchase-requests');

    await this.sendMail({
      to: params.to,
      subject: `Tu solicitud ${requestCode} fue autorizada`,
      text: [
        `Hola ${params.customerName},`,
        '',
        `Tu solicitud ${requestCode} para ${productSummary} fue autorizada por la productora.`,
        `Fecha estimada: ${date}`,
        `Comentario: ${comment}`,
        this.formatItemsText(params.items ?? []),
        `Continuar: ${paymentUrl}`,
      ].filter(Boolean).join('\n'),
      html: this.renderTemplate({
        title: 'Solicitud autorizada',
        preheader: `Tu solicitud ${requestCode} fue autorizada.`,
        badge: 'Autorizada',
        codeLabel: 'Solicitud',
        codeValue: requestCode,
        intro: `Hola ${params.customerName}, tu solicitud fue autorizada por la productora.`,
        paragraphs: [
          `Fecha estimada: ${date}`,
          `Comentario: ${comment}`,
          'Ya puedes ingresar a Parque Industrial Conecta para continuar con el pago.',
        ],
        items: params.items,
        ctaLabel: 'Continuar con el pago',
        ctaUrl: paymentUrl,
      }),
    });
  }

  async sendPurchaseRequestRejectedEmail(params: PurchaseRequestEmailParams): Promise<void> {
    const productSummary = params.productSummary ?? params.productName ?? 'Producto solicitado';
    const requestCode = params.requestId ? this.formatRequestCode(params.requestId) : 'SOLICITUD';
    const reason = params.reason || params.sellerComment || 'La productora no pudo confirmar disponibilidad.';

    await this.sendMail({
      to: params.to,
      subject: `Tu solicitud ${requestCode} no pudo ser confirmada`,
      text: [
        `Hola ${params.customerName},`,
        '',
        `No pudimos confirmar tu solicitud ${requestCode} para ${productSummary}.`,
        `Motivo: ${reason}`,
        this.formatItemsText(params.items ?? []),
        'Puedes revisar otros productos o solicitar una cotización.',
      ].filter(Boolean).join('\n'),
      html: this.renderTemplate({
        title: 'Tu solicitud no pudo ser confirmada',
        preheader: `La solicitud ${requestCode} necesita una alternativa.`,
        badge: 'No confirmada',
        codeLabel: 'Solicitud',
        codeValue: requestCode,
        intro: `Hola ${params.customerName}, no pudimos confirmar tu solicitud.`,
        paragraphs: [
          `Productos: ${productSummary}`,
          `Motivo: ${reason}`,
          'Puedes revisar otros productos o solicitar una cotización desde la plataforma.',
        ],
        items: params.items,
        ctaLabel: 'Ver alternativas',
        ctaUrl: this.frontendUrl('/catalog'),
      }),
    });
  }

  async sendQuoteResolvedEmail(params: {
    to: string;
    customerName: string;
    quoteId?: string;
    quoteTitle: string;
    finalTitle?: string;
    finalPrice?: number | string;
    deliveryTime?: string;
    notes?: string | null;
    quoteUrl?: string;
  }): Promise<void> {
    const quoteUrl = params.quoteUrl ?? this.frontendUrl('/quotes');
    const quoteCode = params.quoteId ? this.formatQuoteCode(params.quoteId) : 'Cotización';
    await this.sendMail({
      to: params.to,
      subject: `Respuesta disponible para tu cotización ${quoteCode}`,
      text: [
        `Hola ${params.customerName},`,
        '',
        `Tu cotización ${quoteCode} ya tiene una propuesta.`,
        `Cotización: ${params.quoteTitle}`,
        params.finalTitle ? `Propuesta: ${params.finalTitle}` : '',
        params.finalPrice ? `Precio final: ${this.formatMoney(params.finalPrice)}` : '',
        params.deliveryTime ? `Tiempo de entrega: ${params.deliveryTime}` : '',
        params.notes ? `Notas: ${params.notes}` : '',
        `Ver cotización: ${quoteUrl}`,
      ].filter(Boolean).join('\n'),
      html: this.renderTemplate({
        title: 'Ya tenemos una respuesta para tu cotización',
        preheader: `Respuesta disponible para ${quoteCode}.`,
        badge: 'Propuesta recibida',
        codeLabel: 'Cotización',
        codeValue: quoteCode,
        intro: `Hola ${params.customerName}, tu cotización ya tiene una propuesta.`,
        sections: [
          {
            title: 'Detalle de la propuesta',
            body: [
              `Cotización: ${params.quoteTitle}`,
              params.finalTitle ? `Propuesta: ${params.finalTitle}` : '',
              params.finalPrice ? `Precio final: ${this.formatMoney(params.finalPrice)}` : '',
              params.deliveryTime ? `Tiempo de entrega: ${params.deliveryTime}` : '',
              params.notes ? `Notas: ${params.notes}` : '',
            ].filter(Boolean),
          },
        ],
        ctaLabel: 'Ver cotización',
        ctaUrl: quoteUrl,
      }),
    });
  }

  async sendOrderDispatchedEmail(params: {
    to: string;
    customerName: string;
    orderId: string;
    orderNumber: number | string;
    items?: MailProductItem[];
    trackingUrl?: string;
    estimatedDeliveryDate?: string | Date | null;
    total?: number | string;
  }): Promise<void> {
    await this.sendOrderStatusChangedEmail({
      ...params,
      statusLabel: 'En camino',
      title: 'Tu pedido esta en camino',
      intro: `Hola ${params.customerName}, tu pedido fue despachado y ya se encuentra en camino.`,
      trackingUrl: params.trackingUrl ?? this.frontendUrl('/orders'),
    });
  }

  async sendOrderStatusChangedEmail(params: {
    to: string;
    customerName: string;
    orderId: string;
    orderNumber: number | string;
    statusLabel: string;
    title: string;
    intro: string;
    items?: MailProductItem[];
    trackingUrl?: string;
    estimatedDeliveryDate?: string | Date | null;
    total?: number | string;
  }): Promise<void> {
    const orderCode = this.formatOrderLabel(params.orderNumber);
    const trackingUrl = params.trackingUrl ?? this.frontendUrl('/orders');
    const summary = [
      { label: 'Estado', value: params.statusLabel },
      { label: 'Pedido', value: orderCode },
      params.estimatedDeliveryDate
        ? { label: 'Entrega estimada', value: this.formatDate(params.estimatedDeliveryDate) }
        : null,
      params.total !== undefined
        ? { label: 'Total', value: this.formatMoney(params.total) }
        : null,
    ].filter((item): item is { label: string; value: string } => Boolean(item));

    await this.sendMail({
      to: params.to,
      subject: this.orderStatusSubject(orderCode, params.statusLabel),
      text: [
        `Hola ${params.customerName},`,
        '',
        params.intro,
        `Pedido: ${orderCode}`,
        `Estado: ${params.statusLabel}`,
        params.estimatedDeliveryDate ? `Entrega estimada: ${this.formatDate(params.estimatedDeliveryDate)}` : '',
        params.total !== undefined ? `Total: ${this.formatMoney(params.total)}` : '',
        this.formatItemsText(params.items ?? []),
        `Ver seguimiento: ${trackingUrl}`,
      ].filter(Boolean).join('\n'),
      html: this.renderTemplate({
        title: params.title,
        preheader: `${params.statusLabel} - ${orderCode}`,
        badge: params.statusLabel,
        codeLabel: 'Pedido',
        codeValue: orderCode,
        intro: params.intro,
        summary,
        items: params.items,
        ctaLabel: 'Ver seguimiento',
        ctaUrl: trackingUrl,
      }),
    });
  }

  async sendWelcomeEmail(params: { to: string; customerName: string; role?: MailUserRole }): Promise<void> {
    const role = params.role ?? 'CLIENT';
    const roleMessage: Record<MailUserRole, string> = {
      CLIENT: 'Ya puedes explorar productos, agregar al carrito y hacer pedidos.',
      SELLER: 'Ya puedes ingresar a tu panel productor para gestionar productos y cotizaciones.',
      ADVISOR: 'Ya puedes atender reclamos y cotizaciones por imagen.',
      ADMIN: 'Ya puedes gestionar usuarios internos desde la plataforma.',
    };

    await this.sendMail({
      to: params.to,
      subject: 'Bienvenido a Parque Industrial Conecta',
      text: [
        `Hola ${params.customerName},`,
        '',
        'Tu cuenta fue creada correctamente.',
        roleMessage[role],
      ].join('\n'),
      html: this.renderTemplate({
        title: `Bienvenido, ${params.customerName}`,
        preheader: 'Tu cuenta fue creada correctamente.',
        badge: 'Cuenta activa',
        intro: 'Tu cuenta fue creada correctamente.',
        paragraphs: [roleMessage[role]],
        ctaLabel: 'Ingresar',
        ctaUrl: this.frontendUrl('/login'),
      }),
    });
  }

  private async sendMailOrThrow(message: MailMessage): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) return;

    await transporter.sendMail({
      from: this.config.get<string>('MAIL_FROM') ?? 'Parque Industrial <no-reply@example.com>',
      to: message.to,
      subject: message.subject,
      text: message.text ?? this.stripHtml(message.html),
      html: message.html,
    });
  }

  private getTransporter(): Transporter | null {
    const provider = (this.config.get<string>('MAIL_PROVIDER') ?? 'log').toLowerCase();
    if (provider !== 'smtp') {
      this.logger.warn(`MAIL_PROVIDER="${provider}" no usa envio SMTP. Correo omitido.`);
      return null;
    }

    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();
    if (!user || !pass) {
      this.logger.warn('SMTP_USER o SMTP_PASS no configurado. Correo omitido.');
      return null;
    }

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('SMTP_HOST') ?? 'smtp.gmail.com',
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: this.parseBoolean(this.config.get<string>('SMTP_SECURE')),
        auth: { user, pass },
      });
    }

    return this.transporter;
  }

  private renderTemplate(options: TemplateOptions): string {
    const paragraphs = options.paragraphs ?? [];
    const cta = options.ctaUrl && options.ctaLabel
      ? `<a href="${this.escape(options.ctaUrl)}" style="display:inline-block;background:#0f2c59;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:800;">${this.escape(options.ctaLabel)}</a>`
      : '';
    const preheader = options.preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">${this.escape(options.preheader)}</div>`
      : '';
    const codeBlock = options.codeLabel && options.codeValue
      ? `<div style="margin:18px 0;padding:14px 16px;border-radius:14px;background:#f7faf8;border:1px solid #e0e9e4;">
          <div style="font-size:12px;color:#64746b;text-transform:uppercase;letter-spacing:.06em;font-weight:800;">${this.escape(options.codeLabel)}</div>
          <div style="font-size:21px;color:#0f2c59;font-weight:900;margin-top:4px;">${this.escape(options.codeValue)}</div>
        </div>`
      : '';
    const badge = options.badge
      ? `<span style="display:inline-block;margin:0 0 14px;padding:7px 11px;border-radius:999px;background:#e8f5e9;color:#2e7d32;font-size:12px;font-weight:900;letter-spacing:.03em;text-transform:uppercase;">${this.escape(options.badge)}</span>`
      : '';
    const sections = (options.sections ?? []).map((section) => {
      const body = Array.isArray(section.body)
        ? section.body.map((line) => `<p style="font-size:14px;line-height:1.55;margin:0 0 7px;color:#344054;">${this.escape(line)}</p>`).join('')
        : `<p style="font-size:14px;line-height:1.55;margin:0;color:#344054;">${this.escape(section.body)}</p>`;
      return `<div style="margin-top:18px;padding:16px;border-radius:14px;background:#fbfcfb;border:1px solid #e8eee9;">
        <h2 style="font-size:15px;margin:0 0 10px;color:#0f2c59;">${this.escape(section.title)}</h2>
        ${body}
      </div>`;
    }).join('');
    const summary = options.summary?.length
      ? `<div style="margin-top:20px;">
          <h2 style="font-size:16px;line-height:1.3;margin:0 0 10px;color:#0f2c59;">Resumen</h2>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #e1e8e2;border-radius:14px;overflow:hidden;background:#fbfcfb;">
            <tbody>
              ${options.summary.map((item) => `
                <tr>
                  <td style="padding:13px 14px;border-bottom:1px solid #edf2ee;color:#64746b;font-size:13px;font-weight:800;width:42%;">${this.escape(item.label)}</td>
                  <td style="padding:13px 14px;border-bottom:1px solid #edf2ee;color:#0f2c59;font-size:14px;font-weight:900;text-align:right;">${this.escape(item.value)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`
      : '';
    const itemsTable = options.items?.length ? this.renderItemsTable(options.items) : '';

    return `
      ${preheader}
      <div style="margin:0;padding:30px;background:#f3f7f4;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#16324f;">
        <div style="max-width:680px;margin:0 auto;">
          <div style="padding:18px 4px;font-size:19px;font-weight:900;color:#0f2c59;">Parque Industrial Conecta</div>
          <div style="background:#ffffff;border-radius:22px;padding:30px;border:1px solid #dfe8e2;box-shadow:0 18px 44px rgba(15,44,89,.08);">
            ${badge}
            <h1 style="font-size:27px;line-height:1.22;margin:0 0 14px;color:#0f2c59;">${this.escape(options.title)}</h1>
            <p style="font-size:16px;line-height:1.65;margin:0 0 16px;color:#344054;">${this.escape(options.intro)}</p>
            ${codeBlock}
            ${paragraphs.map((paragraph) => `<p style="font-size:15px;line-height:1.58;margin:0 0 12px;color:#344054;">${this.escape(paragraph)}</p>`).join('')}
            ${summary}
            ${sections}
            ${itemsTable}
            ${cta ? `<div style="margin-top:26px;">${cta}</div>` : ''}
          </div>
          <p style="font-size:12px;line-height:1.55;color:#5f6f67;margin:18px 4px 0;">Este correo fue enviado automáticamente por Parque Industrial Conecta. Si no reconoces esta actividad, comunícate con soporte.</p>
        </div>
      </div>
    `;
  }

  private renderItemsTable(items: MailProductItem[]): string {
    if (!items.length) return '';

    return `
      <div style="margin-top:22px;">
        <h2 style="font-size:16px;margin:0 0 10px;color:#0f2c59;">Productos incluidos</h2>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #e1e8e2;border-radius:14px;overflow:hidden;">
          <thead>
            <tr>
              <th align="left" style="padding:12px;background:#f4f8f5;color:#0f2c59;font-size:12px;text-transform:uppercase;border-bottom:1px solid #e1e8e2;">Producto</th>
              <th align="center" style="padding:12px;background:#f4f8f5;color:#0f2c59;font-size:12px;text-transform:uppercase;border-bottom:1px solid #e1e8e2;">Cant.</th>
              <th align="right" style="padding:12px;background:#f4f8f5;color:#0f2c59;font-size:12px;text-transform:uppercase;border-bottom:1px solid #e1e8e2;">P. unit.</th>
              <th align="right" style="padding:12px;background:#f4f8f5;color:#0f2c59;font-size:12px;text-transform:uppercase;border-bottom:1px solid #e1e8e2;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => `
              <tr>
                <td style="padding:12px;border-top:1px solid #edf2ee;color:#344054;font-size:14px;">
                  <strong style="color:#0f2c59;">${this.escape(item.title)}</strong>
                  ${item.producerName ? `<div style="font-size:12px;color:#667085;margin-top:3px;">${this.escape(item.producerName)}</div>` : ''}
                </td>
                <td align="center" style="padding:12px;border-top:1px solid #edf2ee;color:#344054;font-size:14px;">${this.escape(String(item.quantity))}</td>
                <td align="right" style="padding:12px;border-top:1px solid #edf2ee;color:#344054;font-size:14px;">${item.unitPrice === undefined ? '-' : this.escape(this.formatMoney(item.unitPrice))}</td>
                <td align="right" style="padding:12px;border-top:1px solid #edf2ee;color:#344054;font-size:14px;font-weight:800;">${item.totalPrice === undefined ? '-' : this.escape(this.formatMoney(item.totalPrice))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  private formatItemsText(items: MailProductItem[]): string {
    if (!items.length) return '';
    return [
      'Productos:',
      ...items.map((item) => {
        const price = item.totalPrice !== undefined ? ` - ${this.formatMoney(item.totalPrice)}` : '';
        const producer = item.producerName ? ` (${item.producerName})` : '';
        return `- ${item.title}${producer} x${item.quantity}${price}`;
      }),
    ].join('\n');
  }

  private frontendUrl(path: string): string {
    const baseUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }

  private formatDate(value: string | Date | null | undefined): string {
    if (!value) return 'Por confirmar';
    return new Date(value).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  private formatMoney(value: number | string): string {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return String(value);
    return `S/ ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatOrderNumber(orderNumber: number | string): string {
    return String(orderNumber).padStart(6, '0');
  }

  private formatOrderLabel(orderNumber: number | string): string {
    return `Pedido N.° ${this.formatOrderNumber(orderNumber)}`;
  }

  private orderStatusSubject(orderCode: string, statusLabel: string): string {
    const subjects: Record<string, string> = {
      'Pedido confirmado': `${orderCode} confirmado`,
      'En preparación': `Tu pedido ${orderCode} está en preparación`,
      'En preparacion': `Tu pedido ${orderCode} esta en preparacion`,
      'Listo para despacho': `Tu pedido ${orderCode} está listo para despacho`,
      'En camino': `Tu pedido ${orderCode} está en camino`,
      Entregado: `${orderCode} entregado`,
    };

    return subjects[statusLabel] ?? `Actualizacion de tu pedido ${orderCode}`;
  }

  private formatQuoteCode(quoteId: string): string {
    return `Cotización N.° ${quoteId.slice(-6).toUpperCase()}`;
  }

  private formatRequestCode(requestId: string): string {
    return `Solicitud N.° ${requestId.slice(-6).toUpperCase()}`;
  }

  private parseBoolean(value: string | undefined): boolean {
    return value === 'true';
  }

  private stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
