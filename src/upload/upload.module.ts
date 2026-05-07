import { Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { ImageProcessingService } from './image-processing.service';
import { VideoProcessingService } from './video-processing.service';

@Module({
  providers: [CloudinaryService, ImageProcessingService, VideoProcessingService],
  exports: [CloudinaryService, ImageProcessingService, VideoProcessingService],
})
export class UploadModule {}
