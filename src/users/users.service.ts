import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { getPagination, paginatedResponse } from '../common/utils/pagination';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  safeUserSelect() {
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

  async create(dto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new ConflictException('El correo ya esta registrado.');

    if (dto.role === Role.CLIENT) {
      throw new BadRequestException('El registro interno no crea cuentas de cliente.');
    }

    if (dto.role === Role.SELLER && !dto.producer) {
      throw new BadRequestException('Los datos de la productora son obligatorios para crear un vendedor.');
    }

    const saltRounds = Number(this.config.get<string>('BCRYPT_SALT_ROUNDS') ?? 10);
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          role: dto.role,
          passwordHash,
        },
        select: this.safeUserSelect(),
      });

      if (dto.role === Role.SELLER && dto.producer) {
        await tx.producer.create({
          data: {
            userId: user.id,
            businessName: dto.producer.businessName,
            type: dto.producer.type,
            location: dto.producer.location,
            description: dto.producer.description,
            isApproved: true,
          },
        });
      }

      return user;
    });

    if (dto.role === Role.SELLER || dto.role === Role.ADVISOR) {
      void this.mail.sendInvitationEmail({
        to: user.email,
        role: dto.role,
        invitationUrl: this.frontendUrl('/login'),
        producerName: dto.role === Role.SELLER ? dto.producer?.businessName : undefined,
      });
    }

    return user;
  }

  async findAll(query: QueryUsersDto) {
    const { page, limit, skip } = getPagination(query.page, query.limit);
    const internalRoles: Role[] = [Role.SELLER, Role.ADVISOR, Role.ADMIN];
    const roleFilter = query.role && internalRoles.includes(query.role)
      ? query.role
      : undefined;
    const where: Prisma.UserWhereInput = {
      role: roleFilter ?? { in: [Role.SELLER, Role.ADVISOR, Role.ADMIN] },
      NOT: { email: { endsWith: '@invitation.local' } },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: this.safeUserSelect(),
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginatedResponse(items, total, page, limit);
  }

  findOne(id: string, actor: { sub: string; role: string }) {
    if (actor.sub !== id && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('No puedes ver otros usuarios.');
    }

    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: this.safeUserSelect() });
  }

  update(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: this.safeUserSelect(),
    });
  }

  deactivate(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: this.safeUserSelect(),
    });
  }

  activate(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: this.safeUserSelect(),
    });
  }

  async remove(id: string, actor: { sub: string; role: string }) {
    if (actor.sub === id) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, role: true },
    });

    if (user.role === Role.CLIENT) {
      throw new BadRequestException('No se pueden eliminar clientes desde gestion de usuarios internos.');
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: this.safeUserSelect(),
    });
  }

  private frontendUrl(path: string) {
    const baseUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }
}
