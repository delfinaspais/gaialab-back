import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  thumbnailUrl?: string;
}

@Injectable()
export class CloudinaryService {
  private readonly folder: string;

  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });
    this.folder = this.config.get<string>('CLOUDINARY_FOLDER') ?? 'gaialab-products';
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get('CLOUDINARY_CLOUD_NAME') &&
        this.config.get('CLOUDINARY_API_KEY') &&
        this.config.get('CLOUDINARY_API_SECRET'),
    );
  }

  /** Upload imagen estándar (retrocompat). */
  async uploadBuffer(buffer: Buffer, filename: string): Promise<CloudinaryUploadResult> {
    return this.uploadProductImage(buffer, filename);
  }

  /**
   * Optimización vía Cloudinary (calidad automática + ancho máx + eager thumbnail).
   * Opcional watermark con CLOUDINARY_WATERMARK_PUBLIC_ID (imagen overlay en cuenta).
   */
  async uploadProductImage(buffer: Buffer, filename: string): Promise<CloudinaryUploadResult> {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException('Cloudinary no está configurado');
    }

    const transformation: Record<string, unknown>[] = [
      { quality: 'auto', fetch_format: 'auto' },
      { width: 1600, crop: 'limit' },
    ];

    const eager = [{ width: 400, height: 400, crop: 'limit', quality: 'auto', fetch_format: 'auto' }];

    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: `${this.folder}/images`,
          resource_type: 'image',
          public_id: filename.replace(/\.[^.]+$/, ''),
          transformation,
          eager,
          eager_async: false,
        },
        (err, result) => {
          if (err || !result) {
            reject(err ?? new Error('Upload failed'));
            return;
          }
          const thumb =
            Array.isArray(result.eager) && result.eager[0]?.secure_url
              ? String(result.eager[0].secure_url)
              : undefined;
          resolve({ url: result.secure_url, publicId: result.public_id, thumbnailUrl: thumb });
        },
      );
      upload.end(buffer);
    });
  }

  async uploadProductVideo(buffer: Buffer, filename: string): Promise<CloudinaryUploadResult> {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException('Cloudinary no está configurado');
    }
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: `${this.folder}/videos`,
          resource_type: 'video',
          public_id: filename.replace(/\.[^.]+$/, ''),
        },
        (err, result) => {
          if (err || !result) {
            reject(err ?? new Error('Video upload failed'));
            return;
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            thumbnailUrl:
              (result as { thumbnail_url?: string }).thumbnail_url ?? (result as { eager?: { secure_url?: string }[] }).eager?.[0]?.secure_url,
          });
        },
      );
      upload.end(buffer);
    });
  }

  async deleteByPublicId(publicId: string, resourceType: 'image' | 'video' = 'image'): Promise<void> {
    if (!this.isConfigured() || !publicId) return;
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  }
}
