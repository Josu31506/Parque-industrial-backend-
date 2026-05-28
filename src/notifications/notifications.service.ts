import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  createForUser(userId: string, title: string, message: string, targetType?: string, targetId?: string) {
    return this.prisma.notification.create({
      data: { userId, title, message, targetType, targetId },
    });
  }

  async createForRole(role: Role, title: string, message: string, targetType?: string, targetId?: string) {
    const users = await this.prisma.user.findMany({ where: { role, isActive: true }, select: { id: true } });
    if (!users.length) return { count: 0 };

    return this.prisma.notification.createMany({
      data: users.map((user) => ({ userId: user.id, title, message, targetType, targetId })),
    });
  }

  listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUniqueOrThrow({ where: { id } });
    if (notification.userId !== userId) return notification;

    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  readAll(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}
