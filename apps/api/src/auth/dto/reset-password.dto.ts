import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";

/** Mismas reglas de contraseña que el registro. */
export class ResetPasswordDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
