import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from '../auth/dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(role?: Role) {
    return this.prisma.user.findMany({
      where: role ? { role } : undefined,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async createByAdmin(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('El email ya está registrado');
    const hash = await bcrypt.hash(dto.password, 12);
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        password: hash,
        name: dto.name,
        role: dto.role ?? Role.CUSTOMER,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.ensureExists(id);
    if (dto.email) {
      const clash = await this.prisma.user.findFirst({
        where: { email: dto.email.toLowerCase(), NOT: { id } },
      });
      if (clash) throw new ConflictException('El email ya está en uso');
    }
    const data: {
      email?: string;
      name?: string | null;
      password?: string;
      role?: Role;
    } = {};
    if (dto.email) data.email = dto.email.toLowerCase();
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.password) data.password = await bcrypt.hash(dto.password, 12);
    if (dto.role) data.role = dto.role;

    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Usuario no encontrado');
  }
}
