import { Injectable } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

/** Capa fina: políticas de tamaño/formato documentadas; el procesado real lo hace Cloudinary. */
@Injectable()
export class ImageProcessingService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  async processAndUpload(buffer: Buffer, suggestedName: string) {
    return this.cloudinary.uploadProductImage(buffer, suggestedName);
  }
}
