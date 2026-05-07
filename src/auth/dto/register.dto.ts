import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'cliente@mail.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'passwordSeguro1' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string;

  @ApiPropertyOptional({ example: 'María García' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: Role, description: 'Solo administradores pueden crear otros admins (ignorado en registro público).' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
