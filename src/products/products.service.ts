import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AvailabilityType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateSlug } from '../common/utils/generate-slug';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { getPagination, paginatedResponse } from '../common/utils/pagination';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class ProductsService {
  private readonly devTimers = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  async create(dto: CreateProductDto, actor: { sub: string; role: string }) {
    this.timeStart('products-service-create');
    const producer = await this.ensureSellerCanUseProducer(dto.producerId, actor);
    this.validateAvailability(dto.availabilityType, dto.stock);
    await this.validateCategoryId(dto.categoryId);
    const slug = await this.buildUniqueSlug(producer.businessName, dto.slug ?? dto.title);

    try {
      this.timeStart('prisma-product-create');
      const product = await this.prisma.product.create({
        data: {
          ...dto,
          producerId: producer.id,
          slug,
          price: new Prisma.Decimal(dto.numericPrice),
          colors: dto.colors ?? Prisma.JsonNull,
        },
        include: this.productInclude(),
      });
      return product;
    } catch (error) {
      if (dto.model3dUrl) {
        try {
          await this.uploadsService.deleteFileByUrl(dto.model3dUrl);
        } catch (delError) {
          console.warn('No se pudo limpiar el modelo 3D subido tras fallo de creación', delError);
        }
      }
      throw error;
    } finally {
      this.timeEnd('prisma-product-create');
      this.timeEnd('products-service-create');
    }
  }

  async findAll(query: QueryProductsDto) {
    this.timeStart('products-findAll');
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
    const { page, limit, skip } = getPagination(query.page, query.limit);

    try {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.product.findMany({
          where,
          include: { category: true, producer: true },
          skip,
          take: limit,
          orderBy: query.sort === 'price_asc' ? { numericPrice: 'asc' } : { createdAt: 'desc' },
        }),
        this.prisma.product.count({ where }),
      ]);

      return paginatedResponse(items, total, page, limit);
    } finally {
      this.timeEnd('products-findAll');
    }
  }

  findOne(id: string) {
    return this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: { category: true, producer: true },
    });
  }

  async findMy(actor: { sub: string; role: string }, query: PaginationQueryDto) {
    this.timeStart('products-findMy');
    try {
      const where: Prisma.ProductWhereInput = {};
      const { page, limit, skip } = getPagination(query.page, query.limit);

      if (actor.role === Role.SELLER) {
        const producer = await this.prisma.producer.findUniqueOrThrow({
          where: { userId: actor.sub },
          select: { id: true },
        });
        where.producerId = producer.id;
      }

      const [items, total] = await this.prisma.$transaction([
        this.prisma.product.findMany({
          where,
          select: this.productListSelect(),
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.product.count({ where }),
      ]);

      return paginatedResponse(items, total, page, limit);
    } finally {
      this.timeEnd('products-findMy');
    }
  }

  async update(id: string, dto: UpdateProductDto, actor: { sub: string; role: string }) {
    this.timeStart('products-service-update');
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: { producer: true },
    });
    this.ensureActorCanManageProducer(product.producer, actor);

    if (dto.categoryId !== undefined && dto.categoryId !== product.categoryId) {
      await this.validateCategoryId(dto.categoryId);
    }

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

    const previousModel3dUrl = product.model3dUrl;

    try {
      this.timeStart('prisma-product-update');
      const updatedProduct = await this.prisma.product.update({
        where: { id },
        data: {
          ...dto,
          producerId: producer.id,
          slug,
          price: dto.numericPrice === undefined ? undefined : new Prisma.Decimal(dto.numericPrice),
          colors: dto.colors === undefined ? undefined : dto.colors,
        },
        include: this.productInclude(),
      });

      // Solo después de actualizar correctamente la BD:
      if (
        dto.model3dUrl !== undefined &&
        dto.model3dUrl !== previousModel3dUrl &&
        previousModel3dUrl
      ) {
        try {
          await this.uploadsService.deleteFileByUrl(previousModel3dUrl);
        } catch (error) {
          console.warn('No se pudo eliminar el modelo 3D anterior de Storage', error);
        }
      }

      return updatedProduct;
    } catch (error) {
      // Evitar archivos huérfanos si la actualización falla:
      // Borrar el nuevo modelo recién subido si es distinto del anterior
      if (
        dto.model3dUrl !== undefined &&
        dto.model3dUrl !== previousModel3dUrl &&
        dto.model3dUrl
      ) {
        try {
          await this.uploadsService.deleteFileByUrl(dto.model3dUrl);
        } catch (delError) {
          console.warn('No se pudo limpiar el modelo 3D nuevo subido tras fallo de actualización', delError);
        }
      }
      throw error;
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

  private async validateCategoryId(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException(
        'La categoría seleccionada no existe o ya no está disponible. Actualiza la página y selecciona una categoría válida.',
      );
    }
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
    if (actor.role === Role.SELLER) {
      return this.prisma.producer.findUniqueOrThrow({ where: { userId: actor.sub } });
    }

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

  private productListSelect() {
    return {
      id: true,
      slug: true,
      producerId: true,
      categoryId: true,
      title: true,
      description: true,
      price: true,
      numericPrice: true,
      imageUrl: true,
      model3dUrl: true,
      badge: true,
      type: true,
      availabilityType: true,
      stock: true,
      estimatedDispatchDays: true,
      requiresConfirmation: true,
      dimensions: true,
      materials: true,
      colors: true,
      finish: true,
      customizable: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { id: true, name: true } },
      producer: { select: { id: true, businessName: true, type: true, location: true, description: true, rating: true, isApproved: true, userId: true } },
    } satisfies Prisma.ProductSelect;
  }

  private timeStart(label: string) {
    if (process.env.NODE_ENV === 'production') return;
    const stack = this.devTimers.get(label) ?? [];
    stack.push(performance.now());
    this.devTimers.set(label, stack);
  }

  private timeEnd(label: string) {
    if (process.env.NODE_ENV === 'production') return;
    const stack = this.devTimers.get(label);
    const startedAt = stack?.pop();

    if (startedAt === undefined) return;
    if (!stack?.length) {
      this.devTimers.delete(label);
    }

    const duration = performance.now() - startedAt;
    console.log(`${label}: ${duration.toFixed(3)}ms`);
  }
}
