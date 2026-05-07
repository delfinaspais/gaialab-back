import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { UpdateAdminProductDto } from './update-admin-product.dto';

export class BulkProductItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ type: UpdateAdminProductDto })
  @ValidateNested()
  @Type(() => UpdateAdminProductDto)
  patch!: UpdateAdminProductDto;
}

export class BulkAdminProductUpdateDto {
  @ApiProperty({ type: [BulkProductItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkProductItemDto)
  items!: BulkProductItemDto[];
}
