import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Min, MinLength, ValidateNested, IsInt } from "class-validator";

export const AIR_PAYMENT_VALUES = ["01", "02", "03", "04"] as const;
export const AIR_DELIVERY_VALUES = ["01", "02", "03", "04", "05"] as const;

export class AirDraftItemDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsString()
  name?: string;
}

export class AirCheckoutPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AirDraftItemDto)
  items!: AirDraftItemDto[];

  @IsOptional()
  @IsString()
  sucursal?: string;

  @IsOptional()
  @IsString()
  vendedor?: string;

  @IsOptional()
  @IsIn(AIR_PAYMENT_VALUES)
  pago?: string;

  @IsOptional()
  @IsIn(AIR_DELIVERY_VALUES)
  entrega?: string;

  @IsOptional()
  @IsString()
  transporte?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AirCheckoutDraftDto extends AirCheckoutPreviewDto {
  @IsString()
  @MinLength(1)
  sucursal!: string;

  @IsString()
  @MinLength(1)
  vendedor!: string;

  @IsIn(AIR_PAYMENT_VALUES)
  pago!: string;

  @IsIn(AIR_DELIVERY_VALUES)
  entrega!: string;

  @IsOptional()
  @IsBoolean()
  background?: boolean;
}
