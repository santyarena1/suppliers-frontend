import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { TENANT_ROLE_LABELS, type TenantRole } from "@nodo/shared";

const ROLES = Object.keys(TENANT_ROLE_LABELS);

export class CreateTeamInviteDto {
  @IsIn(ROLES)
  role!: TenantRole;

  /** Vacío = sin límite de usos. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(500)
  maxUses?: number | null;
}

export class JoinTeamDto {
  @IsString()
  @MaxLength(20)
  code!: string;
}
