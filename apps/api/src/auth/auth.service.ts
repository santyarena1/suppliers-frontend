import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { JwtPayload, UserRole } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenants/tenant-context.service";
import { generatePassword } from "../common/generate-password";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

/**
 * Una sesión suplantada es una herramienta de diagnóstico, no una sesión de
 * trabajo: dura poco para que un token olvidado en un equipo deje de servir solo.
 */
const IMPERSONATION_EXPIRES_IN = "1h";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly tenantContext: TenantContextService
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

    const nameClash = await this.prisma.tenant.findFirst({
      where: { name: dto.commerceName.trim() },
    });
    if (nameClash) throw new ConflictException("Ya existe un comercio con ese nombre");

    const generated = !dto.password;
    const password = dto.password ?? generatePassword();
    const passwordHash = await argon2.hash(password);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.commerceName.trim(),
          type: "RETAILER",
          contactEmail: dto.email,
        },
      });
      const created = await tx.user.create({
        data: { username: dto.username, email: dto.email, passwordHash },
      });
      await tx.tenantMembership.create({
        data: { tenantId: tenant.id, userId: created.id, role: "ADMIN" },
      });
      return created;
    });

    const token = await this.jwt.signAsync(await this.payloadFor(user));
    return generated ? { token, generatedPassword: password } : { token };
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

    const token = await this.jwt.signAsync(await this.payloadFor(user));
    return { token };
  }

  /**
   * Arma el contenido del token. La organización se resuelve acá, en el momento de
   * emitirlo, para que el resto de la plataforma no tenga que buscarla en cada pedido.
   */
  private async payloadFor(
    user: { id: string; username: string; email: string; role: UserRole; brandId: string | null },
    extra: Partial<JwtPayload> = {}
  ): Promise<JwtPayload> {
    const tenant = await this.tenantContext.forUser(user.id);
    return {
      sub: user.username,
      userId: user.id,
      role: user.role,
      email: user.email,
      ...(user.brandId ? { brandId: user.brandId } : {}),
      ...(tenant
        ? {
            tenantId: tenant.tenantId,
            tenantName: tenant.tenantName,
            tenantType: tenant.tenantType,
            tenantRole: tenant.tenantRole,
            commercialTenantId: tenant.commercialTenantId,
          }
        : {}),
      ...extra,
    };
  }

  /**
   * Emite una sesión de `targetUserId` a nombre de un administrador, para poder
   * ver la plataforma exactamente como la ve esa persona.
   *
   * El token resultante lleva marcado quién lo pidió, así ninguna acción hecha
   * durante la suplantación aparece como si la hubiera hecho el usuario real.
   */
  async impersonate(targetUserId: string, admin: JwtPayload) {
    if (targetUserId === admin.userId) {
      throw new BadRequestException("Ya estás usando tu propia cuenta");
    }
    if (admin.impersonatedBy) {
      throw new BadRequestException("Volvé a tu cuenta antes de entrar como otro usuario");
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException("Usuario no encontrado");
    // Que un administrador pueda volverse otro administrador borraría la
    // diferencia entre ambos en la auditoría.
    if (target.role === "ROLE_ADMIN") {
      throw new BadRequestException("No se puede entrar como otro administrador");
    }

    const payload = await this.payloadFor(target, {
      impersonatedBy: admin.userId,
      impersonatedByUsername: admin.sub,
    });

    const token = await this.jwt.signAsync(payload, { expiresIn: IMPERSONATION_EXPIRES_IN });

    await this.prisma.auditLogEntry.create({
      data: {
        entityType: "User",
        entityId: target.id,
        action: "IMPERSONATE",
        performedById: admin.userId,
        changes: { targetUsername: target.username, targetRole: target.role },
      },
    });

    return {
      token,
      user: {
        id: target.id,
        username: target.username,
        email: target.email,
        role: target.role,
        active: target.active,
        ...(target.brandId ? { brandId: target.brandId } : {}),
        tenantId: payload.tenantId ?? null,
        tenantName: payload.tenantName ?? null,
        tenantType: payload.tenantType ?? null,
        tenantRole: payload.tenantRole ?? null,
      },
    };
  }
}
