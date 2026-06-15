import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AvailabilityType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateSlug } from '../common/utils/generate-slug';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto, actor: { sub: string; role: string }) {
    this.timeStart('products-service-create');
    const producer = await this.ensureSellerCanUseProducer(dto.producerId, actor);
    this.validateAvailability(dto.availabilityType, dto.stock);
    const slug = await this.buildUniqueSlug(producer.businessName, dto.slug ?? dto.title);

    try {
      this.timeStart('prisma-product-create');
      return await this.prisma.product.create({
        data: {
          ...dto,
          slug,
          price: new Prisma.Decimal(dto.numericPrice),
          colors: dto.colors ?? Prisma.JsonNull,
        },
        include: this.productInclude(),
      });
    } finally {
      this.timeEnd('prisma-product-create');
      this.timeEnd('products-service-create');
    }
  }

  async findAll(query: QueryProductsDto) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      categoryId: query.categoryId,
      producerId: query.producerId,
      type: query.type,
      availabilityType: query.availabilityType,
      numericPrice: {
        gte: query.minPrice,
        lte: query.maxPrice,
      },
      OR: query.search
        ? [
            { title: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: { category: true, producer: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: query.sort === 'price_asc' ? { numericPrice: 'asc' } : { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  findOne(id: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: { category: true, producer: true },
    });
  }

  async update(id: string, dto: UpdateProductDto, actor: { sub: string; role: string }) {
    this.timeStart('products-service-update');
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: { producer: true },
    });
    this.ensureActorCanManageProducer(product.producer, actor);

    const nextProducerId = dto.producerId ?? product.producerId;
    const producer = nextProducerId === product.producerId
      ? product.producer
      : await this.ensureSellerCanUseProducer(nextProducerId, actor);
    const shouldRegenerateSlug = Boolean(dto.slug || (dto.title && dto.title !== product.title));
    const slug = shouldRegenerateSlug
      ? await this.buildUniqueSlug(producer.businessName, dto.slug ?? dto.title ?? product.title, product.id)
      : undefined;

    if (dto.availabilityType) {
      this.validateAvailability(dto.availabilityType, dto.stock ?? product.stock ?? undefined);
    }

    try {
      this.timeStart('prisma-product-update');
      return await this.prisma.product.update({
        where: { id },
        data: {
          ...dto,
          slug,
          price: dto.numericPrice === undefined ? undefined : new Prisma.Decimal(dto.numericPrice),
          colors: dto.colors === undefined ? undefined : dto.colors,
        },
        include: this.productInclude(),
      });
    } finally {
      this.timeEnd('prisma-product-update');
      this.timeEnd('products-service-update');
    }
  }

  async remove(id: string, actor: { sub: string; role: string }) {
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: { producer: true },
    });
    this.ensureActorCanManageProducer(product.producer, actor);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: this.productInclude(),
    });
  }

  private validateAvailability(availabilityType: AvailabilityType, stock?: number) {
    if (availabilityType === AvailabilityType.CUSTOM_QUOTE) {
      throw new BadRequestException('La cotizacion se gestiona desde /quotes, no como disponibilidad del producto.');
    }

    if (availabilityType === AvailabilityType.IN_STOCK && stock === undefined) {
      throw new BadRequestException('Los productos con stock requieren el campo stock.');
    }
  }

  private async ensureSellerCanUseProducer(producerId: string, actor: { sub: string; role: string }) {
    const producer = await this.prisma.producer.findUniqueOrThrow({ where: { id: producerId } });
    this.ensureActorCanManageProducer(producer, actor);
    return producer;
  }

  private ensureActorCanManageProducer(producer: { userId: string }, actor: { sub: string; role: string }) {
    if (actor.role !== Role.ADMIN && (actor.role !== Role.SELLER || producer.userId !== actor.sub)) {
      throw new ForbiddenException('No puedes gestionar productos de esta productora.');
    }
  }

  private async buildUniqueSlug(producerName: string, productName: string, currentProductId?: string) {
    const baseSlug = `${generateSlug(producerName)}-${generateSlug(productName)}`;
    let slug = baseSlug;
    let suffix = 2;

    while (
      await this.prisma.product.findFirst({
        where: {
          slug,
          id: currentProductId ? { not: currentProductId } : undefined,
        },
        select: { id: true },
      })
    ) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return slug;
  }

  private productInclude() {
    return {
      category: true,
      producer: true,
    } satisfies Prisma.ProductInclude;
  }

  private timeStart(label: string) {
    if (process.env.NODE_ENV !== 'production') console.time(label);
  }

  private timeEnd(label: string) {
    if (process.env.NODE_ENV !== 'production') console.timeEnd(label);
  }
}
