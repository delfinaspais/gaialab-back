import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AndreaniShipmentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  orderId!: string;

  @ApiPropertyOptional({ description: 'Payload opcional específico de contrato Andreani (JSON serializado).' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rawPayload?: string;
}
