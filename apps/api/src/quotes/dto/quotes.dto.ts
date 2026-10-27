import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMaxSize,
  IsArray,
  ValidateNested,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import { SALE_MARGIN_MAX, SALE_MARGIN_MIN } from "@nodo/shared";
import { MAX_QTY } from "../quote-items";
import { MAX_VALIDITY_DAYS, QUOTE_FONTS, QUOTE_PRICE_DISPLAYS, QUOTE_THEMES } from "../quote-settings.service";

/** Texto opcional: vacío se guarda como `null`. */
const optionalText = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  const t = value.trim();
  return t === "" ? null : t;
};

export const QUOTE_CURRENCIES = ["ARS", "USD"] as const;
export const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED"] as const;

export class QuoteClientDto {
  /** Nombre de referencia del presupuesto. */
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(120)
  clientName?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(40)
  clientPhone?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @ValidateIf((_o, v) => v !== null)
  @IsEmail({}, { message: "El mail del cliente no es válido" })
  @MaxLength(160)
  clientEmail?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  /** Condiciones de este presupuesto (null = las de la plantilla). */
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(3000)
  terms?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(QUOTE_CURRENCIES as unknown as string[])
  currency?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601()
  validUntil?: string | null;

  /** Margen para todo el presupuesto (solo quien ve costos). null = el de los proveedores. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(SALE_MARGIN_MIN)
  @Max(SALE_MARGIN_MAX)
  marginPercent?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  /** `null` no vale: un presupuesto siempre tiene estado. */
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(QUOTE_STATUSES as unknown as string[])
  status?: (typeof QUOTE_STATUSES)[number];
}

export class AddQuoteItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  externalId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_QTY)
  qty?: number;
}

export class AddCustomItemDto {
  @Transform(optionalText)
  @IsString()
  @MinLength(1, { message: "Poné qué es (por ejemplo: Armado y prueba)" })
  @MaxLength(300)
  name!: string;

  /** Precio final por unidad, con IVA. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  unitFinalPrice!: number;

  @IsIn(QUOTE_CURRENCIES as unknown as string[])
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_QTY)
  qty?: number;

  @IsOptional()
  @IsIn([0, 10.5, 21, 27])
  ivaPercent?: number;
}

/** Presupuesto nuevo con todas sus líneas de una vez (el armador de PC). */
export class CreateQuoteWithItemsDto extends QuoteClientDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AddQuoteItemDto)
  items!: AddQuoteItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AddCustomItemDto)
  custom?: AddCustomItemDto[];
}

export class UpdateQuoteItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_QTY)
  qty?: number;

  /** Margen propio de la línea (solo quien ve costos). null = vuelve al del presupuesto o las reglas. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(SALE_MARGIN_MIN)
  @Max(SALE_MARGIN_MAX)
  marginPercent?: number | null;

  /** Solo líneas libres. */
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  name?: string;

  /** Solo líneas libres: precio final por unidad, con IVA. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  unitFinalPrice?: number;

  @IsOptional()
  @IsIn(QUOTE_CURRENCIES as unknown as string[])
  currency?: string;

  @IsOptional()
  @IsIn([0, 10.5, 21, 27])
  ivaPercent?: number;
}

export class MoveQuoteItemDto {
  @IsInt()
  @Min(0)
  @Max(1000)
  to!: number;
}

export class QuoteSettingsDto {
  @IsOptional() @IsIn(QUOTE_THEMES as unknown as string[]) theme?: (typeof QUOTE_THEMES)[number];
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: "Color inválido" }) accentColor?: string;
  @IsOptional() @IsIn(QUOTE_FONTS as unknown as string[]) font?: (typeof QUOTE_FONTS)[number];
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(120) businessName?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(40) taxId?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(200) address?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(60) phone?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null && v !== "") @IsEmail({}, { message: "El mail no es válido" }) @MaxLength(120) email?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(120) website?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(1000) intro?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(3000) terms?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(300) footer?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_VALIDITY_DAYS) validityDays?: number;
  @IsOptional() @IsString() @MaxLength(8) numberPrefix?: string;
  @IsOptional() @IsBoolean() showImages?: boolean;
  @IsOptional() @IsBoolean() showSku?: boolean;
  @IsOptional() @IsBoolean() showBrand?: boolean;
  @IsOptional() @IsIn(QUOTE_PRICE_DISPLAYS as unknown as string[]) priceDisplay?: (typeof QUOTE_PRICE_DISPLAYS)[number];
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsNumber() @Min(0) @Max(100) maxSellerDiscount?: number | null;
}
