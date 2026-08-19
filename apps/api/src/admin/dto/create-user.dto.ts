import { IsEmail, IsIn, IsString, MinLength } from "class-validator";
import type { UserRole } from "@nodo/shared";

const ROLES: UserRole[] = ["ROLE_USER", "ROLE_ADMIN", "ROLE_BRAND"];

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(ROLES)
  role!: UserRole;
}
