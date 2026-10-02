import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { JwtPayload } from "@nodo/shared";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { ResendVerificationDto } from "./dto/resend-verification.dto";
import { GoogleLoginDto } from "./dto/google-login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { TurnstileGuard } from "./turnstile.guard";
import { AccountSetupService } from "./account-setup.service";
import { AccountSetupEmailDto, AccountSetupGoogleDto, AccountSetupPasswordDto, AccountSetupVerifyDto } from "./dto/account-setup.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountSetup: AccountSetupService
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(TurnstileGuard)
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(TurnstileGuard)
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(TurnstileGuard)
  @Post("verify-email")
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(TurnstileGuard)
  @Post("resend-verification")
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  /** Manda un código para elegir contraseña nueva. Responde lo mismo exista o no la cuenta. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(TurnstileGuard)
  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /** Código + contraseña nueva: cambia la clave, cierra las otras sesiones y entra. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(TurnstileGuard)
  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.code, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("google")
  google(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto.idToken);
  }

  // ---------- Completar la cuenta (contraseña regenerada) ----------

  @Get("account-setup")
  accountSetupStatus(@CurrentUser() user: JwtPayload) {
    return this.accountSetup.status(user.userId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("account-setup/email")
  accountSetupEmail(@CurrentUser() user: JwtPayload, @Body() dto: AccountSetupEmailDto) {
    return this.accountSetup.sendEmailCode(user.userId, dto.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("account-setup/email/verify")
  accountSetupVerify(@CurrentUser() user: JwtPayload, @Body() dto: AccountSetupVerifyDto) {
    return this.accountSetup.verifyEmail(user.userId, dto.email, dto.code);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("account-setup/password")
  accountSetupPassword(@CurrentUser() user: JwtPayload, @Body() dto: AccountSetupPasswordDto) {
    return this.accountSetup.setPassword(user.userId, dto.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("account-setup/google")
  accountSetupGoogle(@CurrentUser() user: JwtPayload, @Body() dto: AccountSetupGoogleDto) {
    return this.accountSetup.connectGoogle(user.userId, dto.idToken);
  }

  /** Cambiar la propia contraseña (Configuración). Cierra las otras sesiones y devuelve un token nuevo. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("change-password")
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto);
  }

  /** Renueva el JWT mientras la sesión actual todavía es válida. */
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  refresh(@CurrentUser() user: JwtPayload) {
    return this.authService.refresh(user);
  }
}
