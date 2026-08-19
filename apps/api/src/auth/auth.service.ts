import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { JwtPayload } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.username === dto.username ? "El nombre de usuario ya está en uso" : "El email ya está registrado"
      );
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { username: dto.username, email: dto.email, passwordHash },
    });

    return { id: user.id, username: user.username, role: user.role };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException("Usuario o contraseña incorrectos");

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException("Usuario o contraseña incorrectos");

    if (!user.active) throw new UnauthorizedException("La cuenta está desactivada");
    if (user.endDate && user.endDate.getTime() < Date.now()) {
      throw new UnauthorizedException("La cuenta venció");
    }

    const payload: JwtPayload = {
      sub: user.username,
      userId: user.id,
      role: user.role,
      email: user.email,
      ...(user.brandId ? { brandId: user.brandId } : {}),
    };

    const token = await this.jwt.signAsync(payload);
    return { token };
  }
}
