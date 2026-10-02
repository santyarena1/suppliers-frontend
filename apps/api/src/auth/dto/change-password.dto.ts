import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Cambiar la propia contraseña desde Configuración. */
export class ChangePasswordDto {
  /** Obligatoria si la cuenta ya tiene contraseña; una cuenta solo-Google la crea sin esto. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}
