import { IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

/** Alta de un superadmin: el único usuario que no pertenece a una organización. */
export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsEmail()
  email!: string;

  /** Si se omite, la plataforma genera una y la devuelve una única vez. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  /** Se acepta por compatibilidad; el alta siempre es superadmin. */
  @IsOptional()
  @IsIn(["ROLE_ADMIN"])
  role?: "ROLE_ADMIN";

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
