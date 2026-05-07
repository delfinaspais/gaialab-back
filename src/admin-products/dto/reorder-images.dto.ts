import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ReorderImagesDto {
  @ApiProperty({ type: [String], description: 'IDs de imagen en el orden deseado' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  orderedImageIds!: string[];
}
