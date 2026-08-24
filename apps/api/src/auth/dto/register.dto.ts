import { IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  commerceName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username!: string;

  @IsEmail()
  email!: string;

  /** Si no viene, se genera y se devuelve una sola vez. */
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== "")
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}
