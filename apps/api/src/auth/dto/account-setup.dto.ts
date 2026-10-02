import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";

const trimLower = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value);

export class AccountSetupEmailDto {
  @Transform(trimLower)
  @IsEmail()
  @MaxLength(160)
  email!: string;
}

export class AccountSetupVerifyDto {
  @Transform(trimLower)
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

/** Mismas reglas de contraseña que el registro. */
export class AccountSetupPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class AccountSetupGoogleDto {
  @IsString()
  @MinLength(20)
  idToken!: string;
}
