import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";

const CURRENCIES = ["USD", "ARS"] as const;
const IVA_RATES = [0, 10.5, 21, 27] as const;

export class OpenStorefrontDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  contactNote?: string | null;
}

export class UpdateStorefrontDto extends OpenStorefrontDto {
  @IsOptional()
  @IsIn(["ACTIVE", "PAUSED"])
  status?: "ACTIVE" | "PAUSED";
}

export class AddStorefrontProductDto {
  @IsString()
  @MaxLength(300)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ean?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /** Precio neto (sin IVA) por unidad, en `currency`. */
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  @Max(1_000_000_000)
  price!: number;

  @IsIn(CURRENCIES)
  currency!: (typeof CURRENCIES)[number];

  @IsOptional()
  @IsIn(IVA_RATES)
  ivaPercent?: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock!: number;
}

export class UpdateStorefrontProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  brand?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  category?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  @Max(1_000_000_000)
  price?: number;

  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: (typeof CURRENCIES)[number];

  @IsOptional()
  @IsIn(IVA_RATES)
  ivaPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number;
}

export class RespondStorefrontOrderDto {
  @IsIn(["CONFIRM", "REJECT"])
  action!: "CONFIRM" | "REJECT";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class StorefrontOrdersQueryDto {
  @IsOptional()
  @IsIn(["PENDING", "CONFIRMED", "REJECTED", "CANCELLED"])
  status?: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
}

export class ProductsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class CreateUpgradeRequestDto {
  @IsIn(["DISTRIBUTOR", "BRAND"])
  kind!: "DISTRIBUTOR" | "BRAND";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contact?: string | null;
}

export class AdminStorefrontStatusDto {
  @IsIn(["ACTIVE", "SUSPENDED"])
  status!: "ACTIVE" | "SUSPENDED";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

