import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProducerDto } from './dto/create-producer.dto';
import { UpdateProducerDto } from './dto/update-producer.dto';

@Injectable()
export class ProducersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProducerDto) {
    return this.prisma.producer.create({ data: dto });
  }

  findAll() {
    return this.prisma.producer.findMany({
      where: { isApproved: true },
      select: this.publicProducerSelect(),
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.producer.findUniqueOrThrow({
      where: { id },
      select: this.publicProducerSelect(),
    });
  }

  findMe(userId: string) {
    return this.prisma.producer.findUniqueOrThrow({
      where: { userId },
      select: this.publicProducerSelect(),
    });
  }

  products(id: string) {
    return this.prisma.product.findMany({ where: { producerId: id, isActive: true } });
  }

  async update(id: string, dto: UpdateProducerDto, actor: { sub: string; role: string }) {
    const producer = await this.prisma.producer.findUniqueOrThrow({ where: { id } });
    if (actor.role === Role.SELLER && producer.userId !== actor.sub) {
      throw new ForbiddenException('Solo puedes editar tu propia productora.');
    }

    return this.prisma.producer.update({ where: { id }, data: dto });
  }

  async updateMe(userId: string, dto: UpdateProducerDto) {
    const producer = await this.prisma.producer.findUniqueOrThrow({ where: { userId }, select: { id: true } });
    return this.prisma.producer.update({
      where: { id: producer.id },
      data: dto,
      select: this.publicProducerSelect(),
    });
  }

  approve(id: string) {
    return this.prisma.producer.update({ where: { id }, data: { isApproved: true } });
  }

  private publicProducerSelect() {
    return {
      id: true,
      userId: true,
      businessName: true,
      type: true,
      location: true,
      description: true,
      imageUrl: true,
      phone: true,
      bankName: true,
      bankAccountNumber: true,
      bankAccountType: true,
      cci: true,
      accountHolderName: true,
      rating: true,
      isApproved: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.ProducerSelect;
  }
}
