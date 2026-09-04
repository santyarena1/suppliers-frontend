import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { UpdateProviderConfigDto } from "../../providers/dto/update-config.dto";

const LIST_PROVIDER_TYPES = ["DISTRIBUTOR", "BRAND"] as const;
const NUMBER_FORMATS = ["DOT", "COMMA"] as const;
const DIVIDER_MEANINGS = ["BRAND", "CATEGORY", "IGNORE"] as const;

export class CreateListProviderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(LIST_PROVIDER_TYPES as unknown as string[])
  type!: "DISTRIBUTOR" | "BRAND";

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(365)
  listUpdateDays?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  contactPhone?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  /** Configuración de compra del comercio que lo crea (markup, faltantes, esquema…). */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProviderConfigDto)
  config?: UpdateProviderConfigDto;
}

export class EnableOwnListDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(365)
  listUpdateDays?: number | null;
}

export class SaveImportProfileDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  sheetIndex?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  headerRow?: number;

  /** encabezado → campo | null */
  @IsObject()
  columnMap!: Record<string, string | null>;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(3)
  currency?: string | null;

  @IsOptional()
  @IsBoolean()
  priceIncludesIva?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  ivaPercent?: number | null;

  @IsOptional()
  @IsIn(NUMBER_FORMATS as unknown as string[])
  numberFormat?: "DOT" | "COMMA";

  @IsOptional()
  @IsIn(DIVIDER_MEANINGS as unknown as string[])
  dividerMeaning?: "BRAND" | "CATEGORY" | "IGNORE";

  /** Si se manda, esa carga en revisión se vuelve a procesar con el perfil nuevo. */
  @IsOptional()
  @IsString()
  reprocessImportId?: string;
}
