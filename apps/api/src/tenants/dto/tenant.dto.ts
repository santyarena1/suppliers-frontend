import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import {
  ALL_PROVIDERS,
  TENANT_TYPES,
  type TenantLinkStatus,
  type TenantRole,
  type TenantType,
} from "@nodo/shared";

const TENANT_ROLES = [
  "OWNER",
  "ADMIN",
  "BUYER",
  "SELLER",
  "PRODUCT_MANAGER",
  "MARKETING",
  "COMMERCIAL",
  "VIEWER",
] as const;

const LINK_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "REVOKED"] as const;

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(TENANT_TYPES as unknown as string[])
  type!: TenantType;

  @IsOptional()
  @IsIn(ALL_PROVIDERS as unknown as string[])
  providerKey?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  advertisingEnabled?: boolean;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(ALL_PROVIDERS as unknown as string[])
  providerKey?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  brandId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  contactPhone?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  advertisingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateMembershipDto {
  @IsUUID()
  userId!: string;

  @IsIn(TENANT_ROLES as unknown as string[])
  role!: TenantRole;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

export class UpdateMembershipDto {
  @IsOptional()
  @IsIn(TENANT_ROLES as unknown as string[])
  role?: TenantRole;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  title?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Alta de un usuario nuevo directamente dentro de una organización. */
export class CreateTenantUserDto extends CreateMembershipDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsUUID()
  declare userId: string;
}

export class UpsertLinkDto {
  @IsUUID()
  clientTenantId!: string;

  @IsUUID()
  supplierTenantId!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  accountManagerId?: string | null;

  @IsOptional()
  @IsIn(LINK_STATUSES as unknown as string[])
  status?: TenantLinkStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  discountPercent?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  notes?: string | null;
}

export class CreateAccessCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  maxUses?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  @Type(() => Number)
  expiresInDays?: number;
}

export class SetProductManagerScopeDto {
  @IsString({ each: true })
  brandNames!: string[];
}
