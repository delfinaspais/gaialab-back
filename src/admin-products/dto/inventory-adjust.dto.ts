import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryLogType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class InventoryAdjustmentDto {
  @ApiProperty({ enum: InventoryLogType })
  @IsEnum(InventoryLogType)
  type!: InventoryLogType;

  @ApiProperty({
    description:
      'IN: unidades que entran (>0). OUT: unidades que salen (>0). ADJUSTMENT: delta con signo (+/-)',
  })
  @IsInt()
  value!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
