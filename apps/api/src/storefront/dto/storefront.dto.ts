import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { MAX_IMAGES_PER_ITEM, PRODUCT_CONDITIONS, STALE_ACTIONS, STOCK_DAY_OPTIONS } from "../storefront-rules";

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

  /** Adónde le llegan los pedidos de NODO. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsEmail({}, { message: "El mail para recibir pedidos no es válido" })
  @MaxLength(200)
  ordersEmail?: string | null;
}

export class UpdateStorefrontDto extends OpenStorefrontDto {
  @IsOptional()
  @IsIn(["ACTIVE", "PAUSED"])
  status?: "ACTIVE" | "PAUSED";

  /** Nombre con el que la ven los demás. Vacío = el del comercio. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  displayName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1500)
  about?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  logoUrl?: string | null;

  @IsOptional()
  @IsIn(["PUBLIC", "PRIVATE"])
  visibility?: "PUBLIC" | "PRIVATE";

  @IsOptional()
  @IsIn(STOCK_DAY_OPTIONS as unknown as number[])
  stockValidDays?: number;

  @IsOptional()
  @IsIn(STALE_ACTIONS as unknown as string[])
  staleAction?: (typeof STALE_ACTIONS)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  paymentMethods?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  deliveryOptions?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  invoiceTypes?: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  defaultWarranty?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(3000)
  salesTerms?: string | null;

  @IsOptional()
  @IsBoolean()
  sellsOffline?: boolean;
}

export class CloseStorefrontDto {
  /** También borra los productos y las fotos: al reabrir arranca vacía. */
  @IsOptional()
  @IsBoolean()
  deleteProducts?: boolean;
}

export class StorefrontOfferDecisionDto {
  @IsIn(["ACCEPT", "DECLINE"])
  decision!: "ACCEPT" | "DECLINE";
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
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES_PER_ITEM + 4)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  images?: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(PRODUCT_CONDITIONS as unknown as string[])
  condition?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  warranty?: string | null;

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
  sku?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES_PER_ITEM + 4)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  images?: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(PRODUCT_CONDITIONS as unknown as string[])
  condition?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  warranty?: string | null;

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


export class StorefrontItemQueryDto {
  @IsString()
  @MaxLength(80)
  provider!: string;

  @IsString()
  @MaxLength(200)
  externalId!: string;
}

export class LinkSheetDto {
  @IsString()
  @MaxLength(2000)
  url!: string;
}

export class ImageSearchDto {
  @IsString()
  @MaxLength(200)
  query!: string;
}
