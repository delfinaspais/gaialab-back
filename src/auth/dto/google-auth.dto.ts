import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({
    description: 'ID token JWT devuelto por Google Sign-In (frontend). audience = GOOGLE_CLIENT_ID',
  })
  @IsString()
  @MinLength(20)
  idToken!: string;
}
