import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
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
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.producer.findUniqueOrThrow({ where: { id } });
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

  approve(id: string) {
    return this.prisma.producer.update({ where: { id }, data: { isApproved: true } });
  }
}
