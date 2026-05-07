import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateOrderDto {
  @ApiPropertyOptional({ default: 0, description: 'Costo de envío calculado (ej. Andreani)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shippingCost?: number;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  shippingName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(40)
  shippingPhone!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  shippingStreet!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  shippingCity!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  shippingState?: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  shippingZip!: string;

  @ApiPropertyOptional({ default: 'AR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  shippingCountry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Obligatorio si el checkout es como invitado (sin JWT). Para contacto/recibos.',
  })
  @IsOptional()
  @IsEmail()
  guestEmail?: string;
}
