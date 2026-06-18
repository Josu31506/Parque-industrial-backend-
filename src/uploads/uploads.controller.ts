import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UploadsService } from './uploads.service';

const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('products')
  @Roles(Role.SELLER, Role.ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE },
    fileFilter: (_request, file, callback) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        callback(new BadRequestException('Solo se permiten imagenes JPG, PNG o WEBP.'), false);
        return;
      }

      callback(null, true);
    },
  }))
  uploadProductImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: { sub: string },
  ) {
    return this.uploadsService.uploadProductImage(file, user.sub);
  }

  @Post('product-model')
  @Roles(Role.SELLER, Role.ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_request, file, callback) => {
      const extension = file.originalname.toLowerCase().split('.').pop();
      if (extension !== 'glb') {
        callback(new BadRequestException('Solo se permiten archivos con extensión .glb'), false);
        return;
      }
      callback(null, true);
    },
  }))
  uploadProductModel(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: { sub: string },
  ) {
    return this.uploadsService.uploadProductModel(file, user.sub);
  }

  @Post('claim-image')
  @Roles(Role.CLIENT, Role.ADMIN, Role.ADVISOR)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE },
    fileFilter: (_request, file, callback) => {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        callback(new BadRequestException('Solo se permiten imagenes JPG, PNG o WEBP.'), false);
        return;
      }

      callback(null, true);
    },
  }))
  uploadClaimImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: { sub: string },
  ) {
    return this.uploadsService.uploadClaimImage(file, user.sub);
  }
}
