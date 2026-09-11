import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { IvaAdjustment, MissingProductAction, PriceChannel, ZeroStockAction } from "@prisma/client";
import { PAYMENT_OPTION_KINDS, type PaymentOptionKind } from "@nodo/shared";

/** Una forma de pago con su descuento o recargo. Solo informativa. */
export class ProviderPaymentOptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;

  @IsIn(PAYMENT_OPTION_KINDS)
  kind!: PaymentOptionKind;

  @IsOptional()
  @IsIn(["cart", "manual"])
  source?: "cart" | "manual";
}

export class UpdateProviderConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** API (credenciales + cron) o LIST (planillas que sube el comercio). */
  @IsOptional()
  @IsEnum(PriceChannel)
  priceChannel?: PriceChannel;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsNumber()
  @Min(0)
  @Max(100)
  manualIibbPercent?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsNumber()
  @Min(0)
  @Max(100)
  manualPerceptionsPercent?: number | null;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  syncIntervalMinutes?: number;

  @IsOptional()
  @IsEnum(MissingProductAction)
  missingProductAction?: MissingProductAction;

  @IsOptional()
  @IsEnum(ZeroStockAction)
  zeroStockAction?: ZeroStockAction;

  @IsOptional()
  @IsNumber()
  @Min(-50)
  @Max(500)
  priceMarkupPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  minStockThreshold?: number;

  @IsOptional()
  @IsBoolean()
  acceptsOffline?: boolean;

  @IsOptional()
  @IsBoolean()
  acceptsScheme?: boolean;

  @ValidateIf((_, v) => v != null)
  @IsEnum(IvaAdjustment)
  offlineIvaAdjustment?: IvaAdjustment | null;

  @ValidateIf((_, v) => v != null)
  @IsEnum(IvaAdjustment)
  schemeIvaAdjustment?: IvaAdjustment | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  schemeDiscountPercent?: number | null;

  /** Lista completa: lo que no venga acá se borra. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProviderPaymentOptionDto)
  paymentOptions?: ProviderPaymentOptionDto[];
}
