import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PRODUCT_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

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

  async uploadClaimImage(file: Express.Multer.File | undefined, userId: string) {
    this.validateProductImage(file);
    const supabase = this.getSupabaseClient();

    const path = this.buildClaimImagePath(file as Express.Multer.File, userId);
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

  async uploadProductModel(file: Express.Multer.File | undefined, userId: string) {
    this.validateProductModel(file);
    const supabase = this.getSupabaseClient();

    const path = this.buildProductModelPath(file as Express.Multer.File, userId);
    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(path, (file as Express.Multer.File).buffer, {
        contentType: 'model/gltf-binary',
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(error.message || 'No se pudo subir el modelo 3D.');
    }

    const { data } = supabase.storage.from(this.bucket).getPublicUrl(path);
    return { url: data.publicUrl };
  }

  async deleteFileByUrl(url: string | null | undefined): Promise<void> {
    if (!url) return;

    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    if (!supabaseUrl) return;

    if (!url.startsWith(supabaseUrl)) return;

    const prefix = `/storage/v1/object/public/${this.bucket}/`;
    const urlPath = new URL(url).pathname;

    if (!urlPath.startsWith(prefix)) return;

    const relativePath = decodeURIComponent(urlPath.substring(prefix.length));

    if (!relativePath.startsWith('models/')) return;

    const supabase = this.getSupabaseClient();
    const { error } = await supabase.storage.from(this.bucket).remove([relativePath]);
    if (error) {
      console.error(`Error deleting file from Supabase storage: ${error.message}`);
    } else {
      console.log(`Successfully deleted file from Supabase storage: ${relativePath}`);
    }
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

    if (!this.hasValidImageSignature(file)) {
      throw new BadRequestException('El archivo no coincide con un formato de imagen permitido.');
    }

    if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
      throw new BadRequestException('La imagen no debe superar 5 MB.');
    }
  }

  private validateProductModel(file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('El archivo del modelo 3D es obligatorio.');
    }

    const extension = file.originalname.toLowerCase().split('.').pop();
    if (extension !== 'glb') {
      throw new BadRequestException('Solo se permiten archivos con extensión .glb');
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('El archivo no debe superar los 10 MB.');
    }

    if (!this.hasValidGlbSignature(file)) {
      throw new BadRequestException('El archivo no tiene una firma binaria de GLB válida.');
    }

    if (!this.hasValidGlbScene(file.buffer)) {
      throw new BadRequestException('El archivo GLB no contiene una escena 3D válida. Exporta nuevamente el modelo como GLB para web.');
    }
  }

  private buildProductImagePath(file: Express.Multer.File, userId: string) {
    const normalizedName = this.normalizeFileName(file.originalname);
    const extension = PRODUCT_IMAGE_EXTENSIONS[file.mimetype] ?? 'jpg';
    return `products/${userId}/${randomUUID()}-${normalizedName}.${extension}`;
  }

  private buildClaimImagePath(file: Express.Multer.File, userId: string) {
    const normalizedName = this.normalizeFileName(file.originalname);
    const extension = PRODUCT_IMAGE_EXTENSIONS[file.mimetype] ?? 'jpg';
    return `claims/${userId}/${randomUUID()}-${normalizedName}.${extension}`;
  }

  private buildProductModelPath(file: Express.Multer.File, userId: string) {
    const normalizedName = this.normalizeFileName(file.originalname);
    return `models/${userId}/${randomUUID()}-${normalizedName}.glb`;
  }

  private normalizeFileName(fileName: string) {
    const rawName = fileName.split('.')[0];
    const safeName = rawName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80) || 'producto';

    return safeName;
  }

  private hasValidImageSignature(file: Express.Multer.File) {
    const buffer = file.buffer;

    if (file.mimetype === 'image/jpeg') {
      return buffer.length >= 3
        && buffer[0] === 0xff
        && buffer[1] === 0xd8
        && buffer[2] === 0xff;
    }

    if (file.mimetype === 'image/png') {
      return buffer.length >= 8
        && buffer[0] === 0x89
        && buffer[1] === 0x50
        && buffer[2] === 0x4e
        && buffer[3] === 0x47
        && buffer[4] === 0x0d
        && buffer[5] === 0x0a
        && buffer[6] === 0x1a
        && buffer[7] === 0x0a;
    }

    if (file.mimetype === 'image/webp') {
      return buffer.length >= 12
        && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
        && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }

    return false;
  }

  private hasValidGlbSignature(file: Express.Multer.File) {
    const buffer = file.buffer;
    return buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'glTF';
  }

  private hasValidGlbScene(buffer: Buffer): boolean {
    try {
      if (buffer.length < 20) return false;

      const magic = buffer.subarray(0, 4).toString('ascii');
      if (magic !== 'glTF') return false;

      const version = buffer.readUInt32LE(4);
      if (version !== 2) return false;

      const chunkLength = buffer.readUInt32LE(12);
      const chunkType = buffer.subarray(16, 20).toString('ascii');

      if (chunkType !== 'JSON') return false;
      if (buffer.length < 20 + chunkLength) return false;

      const jsonStr = buffer.subarray(20, 20 + chunkLength).toString('utf-8');
      const gltf = JSON.parse(jsonStr);

      if (!gltf.scenes || !Array.isArray(gltf.scenes) || gltf.scenes.length === 0) {
        return false;
      }

      if (!gltf.nodes || !Array.isArray(gltf.nodes) || gltf.nodes.length === 0) {
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  }
}
