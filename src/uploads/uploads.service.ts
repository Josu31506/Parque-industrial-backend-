import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class UploadsService {
  private readonly bucket: string;
  private supabase: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET') ?? 'products';
  }

  async uploadProductImage(file: Express.Multer.File | undefined, userId: string) {
    this.validateProductImage(file);
    const supabase = this.getSupabaseClient();

    const path = this.buildProductImagePath(file as Express.Multer.File, userId);
    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(path, (file as Express.Multer.File).buffer, {
        contentType: (file as Express.Multer.File).mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(error.message || 'No se pudo subir la imagen.');
    }

    const { data } = supabase.storage.from(this.bucket).getPublicUrl(path);
    return { url: data.publicUrl };
  }

  private getSupabaseClient() {
    if (this.supabase) return this.supabase;

    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new InternalServerErrorException('Supabase Storage no esta configurado.');
    }

    this.supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    return this.supabase;
  }

  private validateProductImage(file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('La imagen del producto es obligatoria.');
    }

    if (!ALLOWED_PRODUCT_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Solo se permiten imagenes JPG, PNG o WEBP.');
    }

    if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
      throw new BadRequestException('La imagen no debe superar 5 MB.');
    }
  }

  private buildProductImagePath(file: Express.Multer.File, userId: string) {
    const normalizedName = this.normalizeFileName(file.originalname);
    return `products/${userId}/${Date.now()}-${normalizedName}`;
  }

  private normalizeFileName(fileName: string) {
    const [rawName, ...extensionParts] = fileName.split('.');
    const extension = extensionParts.pop()?.toLowerCase();
    const safeName = rawName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80) || 'producto';

    return extension ? `${safeName}.${extension}` : safeName;
  }
}
