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

type TemplateOptions = {
  title: string;
  intro: string;
  paragraphs?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
};

type PurchaseRequestEmailParams = {
  to: string;
  customerName: string;
  productSummary?: string;
  productName?: string;
  readyDate?: string | Date | null;
  estimatedReadyDate?: string | Date | null;
  sellerComment?: string | null;
  reason?: string | null;
  paymentUrl?: string;
};

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
        intro: 'Gmail SMTP esta configurado correctamente para Parque Industrial Conecta.',
        paragraphs: [
          'Este mensaje confirma que el backend puede enviar correos desde la configuracion local.',
        ],
      }),
    });
  }

  async sendInvitationEmail(params: {
    to: string;
    role: 'SELLER' | 'ADVISOR';
    invitationUrl: string;
    producerName?: string;
  }): Promise<void> {
    const roleLabel = params.role === 'SELLER' ? 'Trabajador/Productor' : 'Asesor';
    await this.sendMail({
      to: params.to,
      subject: 'Invitacion a Parque Industrial Conecta',
      text: [
        `Has sido invitado como ${roleLabel}.`,
        params.producerName ? `Productora asociada: ${params.producerName}` : '',
        `Acepta tu invitacion aqui: ${params.invitationUrl}`,
      ].filter(Boolean).join('\n'),
      html: this.renderTemplate({
        title: 'Invitacion a Parque Industrial Conecta',
        intro: `Has sido invitado como ${roleLabel}.`,
        paragraphs: [
          params.producerName ? `Productora asociada: ${params.producerName}` : '',
          'Abre el enlace para definir tu acceso y empezar a trabajar con la plataforma.',
        ].filter(Boolean),
        ctaLabel: 'Aceptar invitacion',
        ctaUrl: params.invitationUrl,
      }),
    });
  }

  async sendPurchaseRequestConfirmedEmail(params: PurchaseRequestEmailParams): Promise<void> {
    const productSummary = params.productSummary ?? params.productName ?? 'Producto solicitado';
    const date = this.formatDate(params.readyDate ?? params.estimatedReadyDate);
    const comment = params.sellerComment || 'La productora confirmo disponibilidad.';
    const paymentUrl = params.paymentUrl ?? this.frontendUrl('/purchase-requests');

    await this.sendMail({
      to: params.to,
      subject: 'Tu solicitud fue confirmada',
      text: [
        `Hola ${params.customerName},`,
        '',
        `Tu solicitud para ${productSummary} fue confirmada por la productora.`,
        `Fecha estimada: ${date}`,
        `Comentario: ${comment}`,
        `Continuar: ${paymentUrl}`,
      ].join('\n'),
      html: this.renderTemplate({
        title: 'Tu solicitud fue confirmada',
        intro: `Hola ${params.customerName}, tu solicitud fue confirmada por la productora.`,
        paragraphs: [
          `Productos: ${productSummary}`,
          `Fecha estimada: ${date}`,
          `Comentario: ${comment}`,
          'Ya puedes ingresar a Parque Industrial Conecta para continuar con el pago.',
        ],
        ctaLabel: 'Continuar con el pago',
        ctaUrl: paymentUrl,
      }),
    });
  }

  async sendPurchaseRequestRejectedEmail(params: PurchaseRequestEmailParams): Promise<void> {
    const productSummary = params.productSummary ?? params.productName ?? 'Producto solicitado';
    const reason = params.reason || params.sellerComment || 'La productora no pudo confirmar disponibilidad.';

    await this.sendMail({
      to: params.to,
      subject: 'Tu solicitud no pudo ser confirmada',
      text: [
        `Hola ${params.customerName},`,
        '',
        `No pudimos confirmar tu solicitud para ${productSummary}.`,
        `Motivo: ${reason}`,
        'Puedes revisar otros productos o solicitar una cotizacion.',
      ].join('\n'),
      html: this.renderTemplate({
        title: 'Tu solicitud no pudo ser confirmada',
        intro: `Hola ${params.customerName}, no pudimos confirmar tu solicitud.`,
        paragraphs: [
          `Productos: ${productSummary}`,
          `Motivo: ${reason}`,
          'Puedes revisar otros productos o solicitar una cotizacion desde la plataforma.',
        ],
      }),
    });
  }

  async sendQuoteResolvedEmail(params: {
    to: string;
    customerName: string;
    quoteTitle: string;
    quoteUrl?: string;
  }): Promise<void> {
    const quoteUrl = params.quoteUrl ?? this.frontendUrl('/quotes');
    await this.sendMail({
      to: params.to,
      subject: 'Ya tenemos una respuesta para tu cotizacion',
      text: `Hola ${params.customerName}, tu cotizacion "${params.quoteTitle}" ya tiene una propuesta. Ver: ${quoteUrl}`,
      html: this.renderTemplate({
        title: 'Ya tenemos una respuesta para tu cotizacion',
        intro: `Hola ${params.customerName}, tu cotizacion ya tiene una propuesta.`,
        paragraphs: [`Cotizacion: ${params.quoteTitle}`],
        ctaLabel: 'Ver cotizacion',
        ctaUrl: quoteUrl,
      }),
    });
  }

  async sendOrderDispatchedEmail(params: {
    to: string;
    customerName: string;
    orderCode?: string;
    trackingUrl?: string;
  }): Promise<void> {
    const trackingUrl = params.trackingUrl ?? this.frontendUrl('/orders');
    const orderLabel = params.orderCode ? `Pedido ${params.orderCode}` : 'Tu pedido';
    await this.sendMail({
      to: params.to,
      subject: 'Tu pedido esta en camino',
      text: `Hola ${params.customerName}, ${orderLabel} fue despachado. Seguimiento: ${trackingUrl}`,
      html: this.renderTemplate({
        title: 'Tu pedido esta en camino',
        intro: `Hola ${params.customerName}, ${orderLabel} fue despachado.`,
        paragraphs: ['Puedes revisar el seguimiento desde Parque Industrial Conecta.'],
        ctaLabel: 'Ver seguimiento',
        ctaUrl: trackingUrl,
      }),
    });
  }

  async sendWelcomeEmail(params: { to: string; customerName: string }): Promise<void> {
    await this.sendMail({
      to: params.to,
      subject: 'Bienvenido a Parque Industrial Conecta',
      text: `Hola ${params.customerName}, gracias por registrarte en Parque Industrial Conecta.`,
      html: this.renderTemplate({
        title: 'Bienvenido a Parque Industrial Conecta',
        intro: `Hola ${params.customerName}, gracias por registrarte.`,
        paragraphs: ['Ya puedes explorar productos locales y sostenibles desde la plataforma.'],
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
      ? `<a href="${this.escape(options.ctaUrl)}" style="display:inline-block;background:#0f2c59;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">${this.escape(options.ctaLabel)}</a>`
      : '';

    return `
      <div style="margin:0;padding:28px;background:#f3f7f4;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#16324f;">
        <div style="max-width:640px;margin:0 auto;">
          <div style="font-size:18px;font-weight:800;color:#0f2c59;margin-bottom:16px;">Parque Industrial Conecta</div>
          <div style="background:#ffffff;border-radius:18px;padding:28px;border:1px solid #dfe8e2;">
            <h1 style="font-size:24px;line-height:1.25;margin:0 0 14px;color:#0f2c59;">${this.escape(options.title)}</h1>
            <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">${this.escape(options.intro)}</p>
            ${paragraphs.map((paragraph) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px;">${this.escape(paragraph)}</p>`).join('')}
            ${cta ? `<div style="margin-top:24px;">${cta}</div>` : ''}
          </div>
          <p style="font-size:12px;line-height:1.5;color:#5f6f67;margin-top:16px;">Este correo fue enviado automaticamente. Si no reconoces esta actividad, comunicate con soporte.</p>
        </div>
      </div>
    `;
  }

  private frontendUrl(path: string): string {
    const baseUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }

  private formatDate(value: string | Date | null | undefined): string {
    if (!value) return 'Por confirmar';
    return new Date(value).toLocaleDateString('es-PE');
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
