import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, options?: { allowAdminBootstrap?: boolean }) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const adminCount = await this.prisma.user.count({ where: { role: Role.ADMIN } });
    let role: Role = Role.CUSTOMER;
    if (dto.role === Role.ADMIN) {
      if (options?.allowAdminBootstrap && adminCount === 0) {
        role = Role.ADMIN;
      } else {
        role = Role.CUSTOMER;
      }
    }

    const hash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        password: hash,
        name: dto.name,
        role,
      },
      select: { id: true, email: true, role: true, name: true, createdAt: true },
    });

    const accessToken = await this.signToken(user.id, user.email, user.role);
    return { accessToken, user };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!user.password) {
      throw new UnauthorizedException('Esta cuenta usa inicio de sesión con Google');
    }
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const accessToken = await this.signToken(user.id, user.email, user.role);
    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
  }

  async loginWithGoogle(idToken: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId?.trim()) {
      throw new BadRequestException('GOOGLE_CLIENT_ID no está configurado en el servidor');
    }
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new UnauthorizedException('Token de Google sin email');
    }
    const email = payload.email.toLowerCase();
    const googleId = payload.sub;

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          googleId,
          name: payload.name,
          password: null,
          role: Role.CUSTOMER,
        },
      });
    } else {
      if (user.googleId && user.googleId !== googleId) {
        throw new ConflictException('El email ya está asociado a otra cuenta');
      }
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId, name: user.name ?? payload.name },
        });
      }
    }

    const accessToken = await this.signToken(user.id, user.email, user.role);
    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    };
  }

  private signToken(sub: string, email: string, role: Role) {
    const payload: JwtPayload = { sub, email, role };
    return this.jwt.signAsync(payload);
  }
}
