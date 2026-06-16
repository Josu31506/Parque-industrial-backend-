import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InvitationStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';

type InternalInvitationRole = 'SELLER' | 'ADVISOR' | 'ADMIN';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  async create(invitedById: string, dto: CreateInvitationDto) {
    const email = dto.email.toLowerCase().trim();
    this.logger.log(`Creando invitacion para ${email} con rol ${dto.role}.`);

    try {
      await this.ensureEmailCanBeInvited(email);
      const token = this.generateToken();
      const expiresAt = this.addDays(new Date(), 7);

      const invitation = await this.prisma.invitation.create({
        data: {
          email,
          role: dto.role,
          token,
          expiresAt,
          invitedById,
        },
        include: { producer: true },
      });

      await this.sendInvitation(invitation);
      return this.toPublicInvitation(invitation);
    } catch (error) {
      this.logger.error(
        `Error creando invitacion para ${email}.`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  findAll() {
    return this.prisma.invitation.findMany({
      include: { producer: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async validate(token: string) {
    const invitation = await this.findValidInvitation(token);
    return this.toPublicInvitation(invitation);
  }

  async accept(dto: AcceptInvitationDto) {
    const invitation = await this.findValidInvitation(dto.token);
    await this.ensureUserEmailAvailable(invitation.email);

    if (invitation.role === Role.SELLER && !dto.producerData) {
      throw new BadRequestException('Los datos de la productora son obligatorios.');
    }

    const saltRounds = Number(this.config.get<string>('BCRYPT_SALT_ROUNDS') ?? 10);
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: dto.name,
          email: invitation.email,
          phone: dto.phone,
          role: invitation.role,
          passwordHash,
        },
        select: this.safeUserSelect(),
      });

      if (invitation.role === Role.SELLER) {
        if (dto.producerData) {
          await tx.producer.create({
            data: {
              ...dto.producerData,
              userId: createdUser.id,
              isApproved: true,
            },
          });
        }
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
      });

      return createdUser;
    });

    void this.mail.sendWelcomeEmail({
      to: user.email,
      customerName: user.name,
      role: user.role,
    }).catch((error) => this.logger.error(
      `No se pudo enviar bienvenida a ${user.email}.`,
      error instanceof Error ? error.message : String(error),
    ));

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role }),
      user,
    };
  }

  async cancel(id: string) {
    const invitation = await this.prisma.invitation.findUniqueOrThrow({ where: { id } });
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Solo se pueden cancelar invitaciones pendientes.');
    }

    return this.prisma.invitation.update({
      where: { id },
      data: { status: InvitationStatus.CANCELLED },
      include: { producer: true },
    });
  }

  async resend(id: string) {
    const current = await this.prisma.invitation.findUniqueOrThrow({ where: { id } });
    if (current.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Solo se pueden reenviar invitaciones pendientes.');
    }

    const invitation = await this.prisma.invitation.update({
      where: { id },
      data: {
        token: this.generateToken(),
        expiresAt: this.addDays(new Date(), 7),
      },
      include: { producer: true },
    });

    await this.sendInvitation(invitation);
    return this.toPublicInvitation(invitation);
  }

  private async sendInvitation(invitation: {
    email: string;
    role: Role;
    token: string;
    expiresAt?: Date;
    producer?: { businessName: string } | null;
  }) {
    try {
      const role = this.toInternalInvitationRole(invitation.role);
      await this.mail.sendInvitationEmail({
        to: invitation.email,
        role,
        invitationUrl: this.frontendUrl(`/accept-invitation?token=${invitation.token}`),
        producerName: invitation.producer?.businessName,
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo enviar correo de invitacion a ${invitation.email}.`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async findValidInvitation(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { producer: true },
    });

    if (!invitation) throw new NotFoundException('Invitacion no encontrada.');
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new ForbiddenException('La invitacion ya no esta disponible.');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new ForbiddenException('La invitacion ha expirado.');
    }

    return invitation;
  }

  private async ensureEmailCanBeInvited(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    await this.ensureUserEmailAvailable(normalizedEmail);

    const pendingInvitation = await this.prisma.invitation.findFirst({
      where: { email: normalizedEmail, status: InvitationStatus.PENDING },
      select: { id: true },
    });

    if (pendingInvitation) {
      throw new ConflictException('Ya existe una invitacion pendiente para ese correo.');
    }
  }

  private async ensureUserEmailAvailable(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });

    if (user) {
      throw new ConflictException('Ya existe un usuario con ese correo.');
    }
  }

  private toPublicInvitation(invitation: {
    id: string;
    email: string;
    role: Role;
    status: InvitationStatus;
    expiresAt: Date;
    createdAt: Date;
    producer?: { id: string; businessName: string; type: string; location: string; description: string } | null;
  }) {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      producer: invitation.producer
        ? {
          id: invitation.producer.id,
          businessName: invitation.producer.businessName,
          type: invitation.producer.type,
          location: invitation.producer.location,
          description: invitation.producer.description,
        }
        : null,
    };
  }

  private safeUserSelect() {
    return {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private toInternalInvitationRole(role: Role): InternalInvitationRole {
    if (role === Role.CLIENT) {
      throw new BadRequestException('No se envian invitaciones para cuentas cliente.');
    }

    return role;
  }

  private generateToken() {
    return randomBytes(32).toString('hex');
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private frontendUrl(path: string) {
    const baseUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }
}
