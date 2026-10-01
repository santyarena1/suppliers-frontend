import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";
import { TENANT_PLANS, type TenantPlan } from "@nodo/shared";

export class OnboardingStepDto {
  @IsString()
  @MaxLength(40)
  step!: string;
}

/** Superadmin: alta de un comercio con su dueño, igual que el autoregistro. */
export class AdminCreateRetailerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;

  @IsString()
  @MinLength(3)
  @MaxLength(60)
  ownerUsername!: string;

  @IsEmail()
  ownerEmail!: string;

  /** Si se omite, la plataforma genera una y la devuelve una única vez. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  ownerPassword?: string;

  /** Plan comercial. Si se omite, NODO Pro. */
  @IsOptional()
  @IsIn(TENANT_PLANS as unknown as string[])
  plan?: TenantPlan;

  /** ACTIVE: primer cobro en un mes (o `firstBillingAt`). TRIAL: prueba. COURTESY: sin cobro. */
  @IsOptional()
  @IsIn(["ACTIVE", "TRIAL", "COURTESY"])
  billing?: "ACTIVE" | "TRIAL" | "COURTESY";

  @IsOptional()
  @IsDateString()
  firstBillingAt?: string;

  /** Solo con cortesía. Vacío = sin vencimiento. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsDateString()
  courtesyUntil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  courtesyReason?: string;
}

export class BootstrapRetailerOrgDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;

  /** El plan que eligió en la landing: la prueba de 14 días arranca con ese. */
  @IsOptional()
  @IsIn(["BASE", "PRO"])
  trialPlan?: "BASE" | "PRO";
}
