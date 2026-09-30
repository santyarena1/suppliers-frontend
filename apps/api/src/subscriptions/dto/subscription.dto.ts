import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import {
  SUBSCRIPTION_PAYMENT_PROVIDERS,
  TENANT_PLANS,
  type SetupFeeStatus,
  type SubscriptionPaymentProvider,
  type TenantPlan,
} from "@nodo/shared";

export const ADMIN_SUBSCRIPTION_FILTERS = [
  "all",
  "active",
  "upcoming",
  "past_due",
  "grace",
  "suspended",
  "courtesy",
  "cancelled",
] as const;
export type AdminSubscriptionFilter = (typeof ADMIN_SUBSCRIPTION_FILTERS)[number];

export class AdminSubscriptionsQueryDto {
  @IsOptional()
  @IsIn(ADMIN_SUBSCRIPTION_FILTERS as unknown as string[])
  filter?: AdminSubscriptionFilter;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class ChangePlanDto {
  @IsIn(TENANT_PLANS as unknown as string[])
  plan!: TenantPlan;

  /** Precio pactado. `null` vuelve al de lista. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RegisterPaymentDto {
  @IsOptional()
  @IsIn(["SUBSCRIPTION", "SETUP_FEE"])
  kind?: "SUBSCRIPTION" | "SETUP_FEE";

  /** Si falta, el precio vigente × meses (o el monto de la puesta en marcha). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @IsOptional()
  @IsIn(SUBSCRIPTION_PAYMENT_PROVIDERS as unknown as string[])
  provider?: SubscriptionPaymentProvider;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class BillingDateDto {
  @IsDateString()
  nextBillingAt!: string;
}

export class ExtendDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CourtesyDto {
  @IsOptional()
  @IsIn(TENANT_PLANS as unknown as string[])
  plan?: TenantPlan;

  /** `null` o ausente = sin vencimiento. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  until?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class EndCourtesyDto {
  /** CONVERT = pasa a suscripción normal con el próximo cobro indicado; CANCEL = vence hoy. */
  @IsIn(["CONVERT", "CANCEL"])
  mode!: "CONVERT" | "CANCEL";

  @IsOptional()
  @IsDateString()
  nextBillingAt?: string;
}

export class ReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReactivateDto {
  @IsOptional()
  @IsDateString()
  nextBillingAt?: string;
}

export class NotesDto {
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  notes!: string | null;
}

export class SetupFeeDto {
  @IsOptional()
  @IsIn(["NOT_APPLICABLE", "PENDING", "PAID", "WAIVED"])
  status?: SetupFeeStatus;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number | null;

  @IsOptional()
  @IsBoolean()
  blocksCustom?: boolean;
}

export class PlanRequestDto {
  @IsIn(TENANT_PLANS as unknown as string[])
  plan!: TenantPlan;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class PaymentNoticeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
