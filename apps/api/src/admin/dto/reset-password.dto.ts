import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class ResetPasswordDto {
  /** Si se omite, la plataforma genera una y la devuelve una única vez. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  /**
   * Pedir que complete la cuenta al entrar (confirmar mail y elegir otra
   * contraseña o conectar Google). Por defecto sí. En `false` entra directo con
   * esta contraseña y la cambia cuando quiera desde Configuración.
   */
  @IsOptional()
  @IsBoolean()
  requireSetup?: boolean;
}

export class AccountSetupRequiredDto {
  @IsBoolean()
  required!: boolean;
}
