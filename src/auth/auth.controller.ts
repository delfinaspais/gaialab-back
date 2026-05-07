import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Registro (rol customer). Primer usuario del sistema puede bootstrap admin vía /auth/register-admin' })
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('register-admin')
  @ApiOperation({
    summary: 'Crea el primer administrador si no existe ninguno (bootstrap). Luego deshabilitar en producción o proteger.',
  })
  async registerAdmin(@Body() dto: RegisterDto) {
    const adminCount = await this.prisma.user.count({ where: { role: Role.ADMIN } });
    if (adminCount > 0) {
      throw new ForbiddenException('Ya existe un administrador. Solicite alta a soporte.');
    }
    dto.role = Role.ADMIN;
    return this.auth.register(dto, { allowAdminBootstrap: true });
  }

  @Post('login')
  @ApiOperation({ summary: 'Login JWT' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('google')
  @ApiOperation({
    summary: 'Login con Google (ID token del cliente). Configurar GOOGLE_CLIENT_ID en el backend.',
  })
  google(@Body() dto: GoogleAuthDto) {
    return this.auth.loginWithGoogle(dto.idToken);
  }
}
