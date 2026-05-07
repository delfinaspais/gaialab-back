import { Injectable } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

@Injectable()
export class VideoProcessingService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  async upload(buffer: Buffer, suggestedName: string) {
    return this.cloudinary.uploadProductVideo(buffer, suggestedName);
  }
}
