import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

const LEVELS = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;
const STATES = ["INCOMING", "DISCONTINUED"] as const;

export class BrandSkuRefDto {
  @IsString()
  @MinLength(1)
  provider!: string;

  @IsString()
  @MinLength(1)
  externalId!: string;
}

export class NewBrandItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  partNumber?: string | null;

  @IsOptional()
  @IsString()
  ean?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => BrandSkuRefDto)
  skus!: BrandSkuRefDto[];
}

export class CreateBrandItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => NewBrandItemDto)
  items!: NewBrandItemDto[];
}

export class UpdateBrandItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  referencePrice?: number | null;

  @IsOptional()
  @IsIn(["USD", "ARS"])
  currency?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(STATES as unknown as string[])
  state?: (typeof STATES)[number] | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  incomingAt?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateBrandItemLinkDto {
  @ValidateIf((_, v) => v !== null)
  @IsIn(LEVELS as unknown as string[])
  manualLevel!: (typeof LEVELS)[number] | null;
}

export class UpdateBrandStockSettingsDto {
  @IsOptional()
  @IsIn(["AUTO", "MANUAL"])
  mode?: "AUTO" | "MANUAL";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lowBelow?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  highFrom?: number;

  @IsOptional()
  @IsBoolean()
  brandSeesExact?: boolean;

  @IsOptional()
  @IsBoolean()
  publicStock?: boolean;
}
