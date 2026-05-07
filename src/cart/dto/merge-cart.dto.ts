import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class MergeCartDto {
  @ApiProperty({ description: 'ID devuelto por POST /cart/guest-session' })
  @IsString()
  @MinLength(10)
  guestSessionId!: string;
}
