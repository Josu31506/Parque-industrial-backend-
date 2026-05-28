import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        ...dto,
        slug: slugify(dto.name),
      },
    });
  }

  findAll() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  findOne(id: string) {
    return this.prisma.category.findUniqueOrThrow({ where: { id } });
  }

  update(id: string, dto: UpdateCategoryDto) {
    return this.prisma.category.update({
      where: { id },
      data: {
        ...dto,
        slug: dto.name ? slugify(dto.name) : undefined,
      },
    });
  }

  remove(id: string) {
    return this.prisma.category.delete({ where: { id } });
  }
}
