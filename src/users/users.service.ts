import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
    const saltRounds = Number(this.config.get<string>('BCRYPT_SALT_ROUNDS') ?? 10);
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        role: dto.role,
        passwordHash: await bcrypt.hash(dto.password, saltRounds),
      },
      select: this.safeUserSelect(),
    });
  }

  findAll() {
    return this.prisma.user.findMany({ select: this.safeUserSelect(), orderBy: { createdAt: 'desc' } });
  }

  findOne(id: string, actor: { sub: string; role: string }) {
    if (actor.role === Role.CLIENT && actor.sub !== id) {
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
}
