import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { CreateAdminProductDto, NewTagDto } from './create-admin-product.dto';

/** PUT: todos los campos opcionales; categorías/sku incluibles. */
export class UpdateAdminProductDto extends PartialType(
  OmitType(CreateAdminProductDto, ['newTags'] as const),
) {
  @ApiPropertyOptional({ type: [NewTagDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NewTagDto)
  newTags?: NewTagDto[];
}
