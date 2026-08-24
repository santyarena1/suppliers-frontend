import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, Max, Min, ValidateIf } from "class-validator";
import { IvaAdjustment, MissingProductAction, ZeroStockAction } from "@prisma/client";

export class UpdateProviderConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

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
