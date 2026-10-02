import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import {
  ACCOUNT_SETUP,
  ACCOUNT_SETUP_VERIFIED,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  emailCodesEqual,
  generateEmailCode,
  hashEmailCode,
} from "./email-codes";
import { GoogleTokenVerifier } from "./google-token.verifier";
import { forgetSession } from "./jwt.strategy";

/** Cuánto vale el mail confirmado para terminar con la contraseña nueva. */
const VERIFIED_WINDOW_MS = 60 * 60_000;

/**
 * Completar la cuenta después de que el superadmin (o el dueño, a alguien de su
 * equipo) le regeneró la contraseña: confirma su mail y elige contraseña nueva,
 * o conecta Google. Hasta entonces `mustSetupAccount` bloquea el resto (ver
 * account-setup-gate.ts y JwtStrategy).
 */
@Injectable()
export class AccountSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly google: GoogleTokenVerifier,
    private readonly config: ConfigService
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, email: true, mustSetupAccount: true },
    });
    if (!user) throw new UnauthorizedException("Tu sesión ya no es válida. Volvé a entrar.");
    return user;
  }

  async sendEmailCode(userId: string, email: string) {
    const user = await this.pendingUser(userId);
    await this.assertEmailFree(email, user.id);
    const existing = await this.prisma.emailChallenge.findUnique({
      where: { userId_purpose: { userId: user.id, purpose: ACCOUNT_SETUP } },
    });
    if (existing && existing.codeHash !== ACCOUNT_SETUP_VERIFIED && Date.now() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new BadRequestException({ message: "Esperá un minuto para reenviar el código", code: "RESEND_COOLDOWN" });
    }
    const code = generateEmailCode();
    const data = {
      codeHash: this.hash(`${email}:${code}`),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      attempts: 0,
      lastSentAt: new Date(),
    };
    await this.prisma.emailChallenge.upsert({
      where: { userId_purpose: { userId: user.id, purpose: ACCOUNT_SETUP } },
      create: { userId: user.id, purpose: ACCOUNT_SETUP, ...data },
      update: data,
    });
    await this.mail.sendVerificationCode(email, user.username, code);
    return { sent: true };
  }

  /** El código va atado al mail al que se mandó: no sirve para confirmar otro. */
  async verifyEmail(userId: string, email: string, code: string) {
    const user = await this.pendingUser(userId);
    const invalid = () => new BadRequestException("Código inválido o vencido");
    const challenge = await this.prisma.emailChallenge.findUnique({
      where: { userId_purpose: { userId: user.id, purpose: ACCOUNT_SETUP } },
    });
    if (
      !challenge ||
      challenge.codeHash === ACCOUNT_SETUP_VERIFIED ||
      challenge.attempts >= MAX_ATTEMPTS ||
      challenge.expiresAt.getTime() < Date.now()
    ) {
      throw invalid();
    }
    if (!emailCodesEqual(challenge.codeHash, this.hash(`${email}:${code.trim()}`))) {
      await this.prisma.emailChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw invalid();
    }
    await this.assertEmailFree(email, user.id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { email, emailVerifiedAt: new Date() } }),
      // Queda como constancia de que el mail se confirmó en este proceso.
      this.prisma.emailChallenge.update({
        where: { id: challenge.id },
        data: { codeHash: ACCOUNT_SETUP_VERIFIED, expiresAt: new Date(Date.now() + VERIFIED_WINDOW_MS) },
      }),
    ]);
    return { verified: true, email };
  }

  async setPassword(userId: string, password: string) {
    const user = await this.pendingUser(userId);
    const challenge = await this.prisma.emailChallenge.findUnique({
      where: { userId_purpose: { userId: user.id, purpose: ACCOUNT_SETUP } },
    });
    if (!challenge || challenge.codeHash !== ACCOUNT_SETUP_VERIFIED || challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Primero confirmá tu mail con el código que te mandamos");
    }
    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustSetupAccount: false,
          sessionVersion: { increment: 1 },
          failedLoginCount: 0,
          loginLockedUntil: null,
        },
      }),
      this.prisma.emailChallenge.delete({ where: { id: challenge.id } }),
    ]);
    forgetSession(user.id);
    return this.auth.issueTokenForUserId(user.id);
  }

  /** Con Google la cuenta queda atada a ese mail y deja de tener contraseña (la temporal no sirve más). */
  async connectGoogle(userId: string, idToken: string) {
    const user = await this.pendingUser(userId);
    const profile = await this.google.verify(idToken);
    if (!profile.emailVerified) throw new UnauthorizedException("Google no confirmó el email");
    const email = profile.email.trim().toLowerCase();
    const byGoogle = await this.prisma.user.findUnique({ where: { googleId: profile.googleId }, select: { id: true } });
    if (byGoogle && byGoogle.id !== user.id) {
      throw new ConflictException("Esa cuenta de Google ya está conectada a otro usuario");
    }
    await this.assertEmailFree(email, user.id);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.googleId,
          email,
          emailVerifiedAt: new Date(),
          passwordHash: null,
          mustSetupAccount: false,
          sessionVersion: { increment: 1 },
          failedLoginCount: 0,
          loginLockedUntil: null,
        },
      }),
      this.prisma.emailChallenge.deleteMany({ where: { userId: user.id, purpose: ACCOUNT_SETUP } }),
    ]);
    forgetSession(user.id);
    return this.auth.issueTokenForUserId(user.id);
  }

  private async pendingUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, active: true, mustSetupAccount: true },
    });
    if (!user || !user.active) throw new UnauthorizedException("Tu sesión ya no es válida. Volvé a entrar.");
    if (!user.mustSetupAccount) {
      throw new BadRequestException({ message: "Tu cuenta ya está completa", code: "ACCOUNT_ALREADY_SET_UP" });
    }
    return user;
  }

  private async assertEmailFree(email: string, userId: string) {
    const other = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, NOT: { id: userId } },
      select: { id: true },
    });
    if (other) throw new ConflictException("Ese mail ya lo usa otra cuenta");
  }

  private hash(value: string): string {
    const pepper = this.config.get<string>("EMAIL_CODE_PEPPER")?.trim() || this.config.get<string>("JWT_SECRET") || "nodo";
    return hashEmailCode(value, pepper);
  }
}
