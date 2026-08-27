import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { CATALOG_ALIAS_KINDS, CATALOG_MATCH_KINDS } from "../../catalog/catalog-enrichment";

export class RawValuesQueryDto {
  @IsIn(CATALOG_ALIAS_KINDS)
  kind!: (typeof CATALOG_ALIAS_KINDS)[number];

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  codesOnly?: boolean;

  @IsOptional()
  limit?: number;
}

export class SaveOpenAiKeyDto {
  @IsString()
  @MinLength(8)
  @MaxLength(300)
  apiKey!: string;
}

export class CatalogRawItemDto {
  @IsString()
  provider!: string;

  @IsString()
  @MinLength(1)
  rawKey!: string;
}

export class LinkCatalogRawsDto {
  @IsIn(CATALOG_ALIAS_KINDS)
  kind!: (typeof CATALOG_ALIAS_KINDS)[number];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogRawItemDto)
  items!: CatalogRawItemDto[];

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  termId?: string;

  @IsOptional()
  @IsEnum(["MANUAL", "AUTO", "AI"] as const)
  source?: "MANUAL" | "AUTO" | "AI";
}

export class MoveCatalogProductsDto {
  @IsIn(CATALOG_ALIAS_KINDS)
  kind!: (typeof CATALOG_ALIAS_KINDS)[number];

  @ValidateNested()
  @Type(() => CatalogRawItemDto)
  from!: CatalogRawItemDto;

  @IsOptional()
  @IsString()
  toTermId?: string;

  @IsOptional()
  @IsString()
  toLabel?: string;

  @IsOptional()
  @IsBoolean()
  deleteEmptySourceTerm?: boolean;

  @IsOptional()
  @IsEnum(["MANUAL", "AUTO", "AI"] as const)
  source?: "MANUAL" | "AUTO" | "AI";
}

export class CreateCatalogTermDto {
  @IsIn(CATALOG_ALIAS_KINDS)
  kind!: (typeof CATALOG_ALIAS_KINDS)[number];

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @IsBoolean()
  inMenu?: boolean;
}

export class UpdateCatalogTermDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @IsBoolean()
  inMenu?: boolean;
}

export class ToggleRawVisibilityDto {
  @IsIn(CATALOG_ALIAS_KINDS)
  kind!: (typeof CATALOG_ALIAS_KINDS)[number];

  @IsString()
  provider!: string;

  @IsString()
  @MinLength(1)
  rawKey!: string;

  @IsBoolean()
  visible!: boolean;
}

export class AssignProductDto {
  @IsString()
  provider!: string;

  @IsString()
  externalId!: string;

  @IsOptional()
  @IsString()
  displayBrand?: string | null;

  @IsOptional()
  @IsString()
  displayCategory?: string | null;

  @IsOptional()
  @IsString()
  displaySubcategory?: string | null;

  @IsOptional()
  @IsEnum(["MANUAL", "AUTO", "AI"] as const)
  source?: "MANUAL" | "AUTO" | "AI";
}

export class IncompleteQueryDto {
  @IsOptional()
  limit?: number;

  @IsOptional()
  offset?: number;

  @IsOptional()
  @IsString()
  q?: string;
}

export class UpsertCatalogAliasDto {
  @IsIn(CATALOG_ALIAS_KINDS)
  kind!: (typeof CATALOG_ALIAS_KINDS)[number];

  @IsOptional()
  @IsString()
  provider?: string | null;

  @IsArray()
  @IsString({ each: true })
  rawKeys!: string[];

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsEnum(["MANUAL", "AUTO", "AI"] as const)
  source?: "MANUAL" | "AUTO" | "AI";
}

export class UpsertCatalogIdentityDto {
  @IsIn(CATALOG_MATCH_KINDS)
  matchKind!: (typeof CATALOG_MATCH_KINDS)[number];

  @IsString()
  @MinLength(1)
  matchKey!: string;

  @IsOptional()
  @IsString()
  displayBrand?: string | null;

  @IsOptional()
  @IsString()
  displayCategory?: string | null;

  @IsOptional()
  @IsString()
  displaySubcategory?: string | null;

  @IsOptional()
  @IsEnum(["MANUAL", "AUTO", "AI"] as const)
  source?: "MANUAL" | "AUTO" | "AI";
}

export class ApplyCatalogSuggestionDto {
  @IsIn(["alias", "identity", "code"])
  type!: "alias" | "identity" | "code";

  @IsOptional()
  @IsIn(CATALOG_ALIAS_KINDS)
  kind?: (typeof CATALOG_ALIAS_KINDS)[number];

  @IsOptional()
  @IsString()
  provider?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rawKeys?: string[];

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsIn(CATALOG_MATCH_KINDS)
  matchKind?: (typeof CATALOG_MATCH_KINDS)[number];

  @IsOptional()
  @IsString()
  matchKey?: string;

  @IsOptional()
  @IsString()
  displayBrand?: string | null;

  @IsOptional()
  @IsString()
  displayCategory?: string | null;

  @IsOptional()
  @IsString()
  displaySubcategory?: string | null;
}

export class AiProductHintQueryDto {
  @IsString()
  provider!: string;

  @IsString()
  externalId!: string;
}

export class PreviewRawQueryDto {
  @IsIn(CATALOG_ALIAS_KINDS)
  kind!: (typeof CATALOG_ALIAS_KINDS)[number];

  @IsOptional()
  @IsString()
  rawKey?: string;

  @IsOptional()
  @IsString()
  termId?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  limit?: number;
}
