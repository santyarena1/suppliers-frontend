import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import type { JwtPayload, UserRole } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { TenantContextService } from "../tenants/tenant-context.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { GoogleTokenVerifier } from "./google-token.verifier";
import {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  VERIFY_EMAIL,
  emailCodesEqual,
  generateEmailCode,
  hashEmailCode,
} from "./email-codes";

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
    private readonly tenantContext: TenantContextService,
    private readonly mail: MailService,
    private readonly google: GoogleTokenVerifier,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto) {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, { email: { equals: email, mode: "insensitive" } }],
      },
    });
    if (existing) {
      if (
        existing.username === username &&
        existing.email.toLowerCase() === email &&
        !existing.emailVerifiedAt &&
        existing.passwordHash &&
        (await argon2.verify(existing.passwordHash, dto.password))
      ) {
        await this.issueVerificationCode(existing.id, existing.email, existing.username);
        return { id: existing.id, username: existing.username, email: existing.email, needsVerification: true };
      }
      throw new ConflictException(
        existing.username === username ? "El nombre de usuario ya está en uso" : "El email ya está registrado"
      );
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { username, email, passwordHash },
    });
    await this.issueVerificationCode(user.id, user.email, user.username);
    return { id: user.id, username: user.username, email: user.email, needsVerification: true };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException("Usuario o contraseña incorrectos");
    if (!user.passwordHash) {
      throw new UnauthorizedException("Esta cuenta entra con Google");
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException("Usuario o contraseña incorrectos");

    this.assertAccountUsable(user);
    this.assertEmailVerified(user);

    const token = await this.jwt.signAsync(await this.payloadFor(user));
    return { token };
  }

  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: "insensitive" } },
    });
    if (!user || user.emailVerifiedAt) {
      throw new BadRequestException("Código inválido o vencido");
    }

    const challenge = await this.prisma.emailChallenge.findUnique({
      where: { userId_purpose: { userId: user.id, purpose: VERIFY_EMAIL } },
    });
    if (!challenge || challenge.attempts >= MAX_ATTEMPTS || challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Código inválido o vencido");
    }

    const expected = hashEmailCode(code.trim(), this.pepper());
    if (!emailCodesEqual(challenge.codeHash, expected)) {
      await this.prisma.emailChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Código inválido o vencido");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } }),
      this.prisma.emailChallenge.delete({ where: { id: challenge.id } }),
    ]);

    this.assertAccountUsable(user);
    const token = await this.jwt.signAsync(await this.payloadFor(user));
    return { token };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: "insensitive" } },
    });
    // Misma respuesta siempre: no se enumera si el mail existe.
    if (!user || user.emailVerifiedAt) return { sent: true };
    await this.issueVerificationCode(user.id, user.email, user.username);
    return { sent: true };
  }

  async loginWithGoogle(idToken: string) {
    const profile = await this.google.verify(idToken);
    if (!profile.emailVerified) {
      throw new UnauthorizedException("Google no confirmó el email");
    }
    const email = profile.email.trim().toLowerCase();

    let user = await this.prisma.user.findUnique({ where: { googleId: profile.googleId } });
    if (!user) {
      user = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
    }

    if (user) {
      this.assertAccountUsable(user);
      if (user.googleId && user.googleId !== profile.googleId) {
        throw new ConflictException("El email ya está registrado");
      }
      const data: { googleId?: string; emailVerifiedAt?: Date } = {};
      if (!user.googleId) data.googleId = profile.googleId;
      if (!user.emailVerifiedAt) data.emailVerifiedAt = new Date();
      if (Object.keys(data).length) {
        user = await this.prisma.user.update({ where: { id: user.id }, data });
      }
    } else {
      const username = await this.uniqueUsername(this.usernameFromEmail(email));
      user = await this.prisma.user.create({
        data: {
          username,
          email,
          googleId: profile.googleId,
          emailVerifiedAt: new Date(),
        },
      });
    }

    const token = await this.jwt.signAsync(await this.payloadFor(user));
    return { token };
  }

  /**
   * Emite un JWT nuevo para la misma persona (y la misma suplantación, si hay).
   * El token de entrada tiene que seguir siendo válido: esto alarga la sesión
   * mientras la pestaña está abierta, no revive una ya vencida.
   */
  async refresh(session: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) throw new UnauthorizedException("Usuario no encontrado");
    this.assertAccountUsable(user);

    const extra: Partial<JwtPayload> = session.impersonatedBy
      ? {
          impersonatedBy: session.impersonatedBy,
          impersonatedByUsername: session.impersonatedByUsername,
        }
      : {};
    const payload = await this.payloadFor(user, extra);
    const token = session.impersonatedBy
      ? await this.jwt.signAsync(payload, { expiresIn: IMPERSONATION_EXPIRES_IN })
      : await this.jwt.signAsync(payload);
    return { token };
  }

  /**
   * Emite un JWT fresco para un usuario ya autenticado (p. ej. después de crear
   * la organización en el onboarding, cuando el token viejo no traía tenant).
   */
  async issueTokenForUserId(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Usuario no encontrado");
    this.assertAccountUsable(user);
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

  private assertAccountUsable(user: { active: boolean; endDate: Date | null }) {
    if (!user.active) throw new UnauthorizedException("La cuenta está desactivada");
    if (user.endDate && user.endDate.getTime() < Date.now()) {
      throw new UnauthorizedException("La cuenta venció");
    }
  }

  private assertEmailVerified(user: { email: string; emailVerifiedAt: Date | null }) {
    if (user.emailVerifiedAt) return;
    throw new ForbiddenException({
      message: "Tenés que confirmar tu email para entrar",
      code: "EMAIL_NOT_VERIFIED",
      details: { email: user.email },
    });
  }

  private async issueVerificationCode(userId: string, email: string, username: string) {
    const existing = await this.prisma.emailChallenge.findUnique({
      where: { userId_purpose: { userId, purpose: VERIFY_EMAIL } },
    });
    if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new BadRequestException({
        message: "Esperá un minuto para reenviar el código",
        code: "RESEND_COOLDOWN",
      });
    }

    const code = generateEmailCode();
    const data = {
      codeHash: hashEmailCode(code, this.pepper()),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      attempts: 0,
      lastSentAt: new Date(),
    };
    await this.prisma.emailChallenge.upsert({
      where: { userId_purpose: { userId, purpose: VERIFY_EMAIL } },
      create: { userId, purpose: VERIFY_EMAIL, ...data },
      update: data,
    });
    await this.mail.sendVerificationCode(email, username, code);
  }

  private pepper(): string {
    return this.config.get<string>("EMAIL_CODE_PEPPER")?.trim() || this.config.get<string>("JWT_SECRET") || "nodo";
  }

  private usernameFromEmail(email: string): string {
    const local = email.split("@")[0] ?? "nodo";
    const cleaned = local.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
    return cleaned.length >= 3 ? cleaned : `nodo${cleaned}`.padEnd(3, "0").slice(0, 32);
  }

  private async uniqueUsername(base: string): Promise<string> {
    const stem = base.slice(0, 32) || "nodo";
    let candidate = stem;
    let n = 1;
    while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
      n += 1;
      const suffix = String(n);
      candidate = `${stem.slice(0, Math.max(1, 32 - suffix.length))}${suffix}`;
    }
    return candidate;
  }
}
