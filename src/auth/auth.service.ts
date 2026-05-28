import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new ConflictException('El correo ya esta registrado.');

    const saltRounds = Number(this.config.get<string>('BCRYPT_SALT_ROUNDS') ?? 10);
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: Role.CLIENT,
      },
      select: this.safeUserSelect(),
    });

    return {
      accessToken: await this.signToken(user.id, user.email, user.role),
      user,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user?.isActive) throw new UnauthorizedException('Credenciales invalidas.');

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) throw new UnauthorizedException('Credenciales invalidas.');

    const safeUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: this.safeUserSelect(),
    });

    return {
      accessToken: await this.signToken(user.id, user.email, user.role),
      user: safeUser,
    };
  }

  async me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: this.safeUserSelect(),
    });
  }

  private async signToken(sub: string, email: string, role: Role) {
    return this.jwt.signAsync({ sub, email, role });
  }

  private safeUserSelect() {
    return {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    };
  }
}
