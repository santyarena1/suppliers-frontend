import { IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import type { UserRole } from "@nodo/shared";

const ROLES: UserRole[] = ["ROLE_USER", "ROLE_ADMIN", "ROLE_BRAND"];

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

  @IsIn(ROLES)
  role!: UserRole;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
