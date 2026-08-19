import { IsIn } from "class-validator";
import type { UserRole } from "@nodo/shared";

const ROLES: UserRole[] = ["ROLE_USER", "ROLE_ADMIN", "ROLE_BRAND"];

export class UpdateRoleDto {
  @IsIn(ROLES)
  role!: UserRole;
}
