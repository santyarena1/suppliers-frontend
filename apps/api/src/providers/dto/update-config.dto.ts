import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";
import { MissingProductAction, ZeroStockAction } from "@prisma/client";

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
}
