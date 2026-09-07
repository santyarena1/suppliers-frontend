import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, Max, Min, ValidateIf } from "class-validator";
import { IvaAdjustment, MissingProductAction, PriceChannel, ZeroStockAction } from "@prisma/client";

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
}
