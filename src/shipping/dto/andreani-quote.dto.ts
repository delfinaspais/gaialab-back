import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AndreaniQuoteDto {
  @ApiProperty({ description: 'Código postal origen (depósito)' })
  @IsString()
  @MinLength(3)
  @MaxLength(10)
  originZip!: string;

  @ApiProperty({ description: 'Código postal destino' })
  @IsString()
  @MinLength(3)
  @MaxLength(10)
  destinationZip!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightKg?: number;
}
