import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const ACTION_KINDS = ["PURCHASE_QTY", "PURCHASE_AMOUNT", "REBATE"] as const;
const ACTION_STATUSES = ["DRAFT", "ACTIVE", "ENDED", "CANCELLED"] as const;
const REWARD_KINDS = ["NONE", "FLAT", "PER_UNIT"] as const;
const SCOPE_KINDS = ["DISTRIBUTOR", "RETAILER", "PRODUCT"] as const;

export class BrandActionScopeDto {
  @IsIn(SCOPE_KINDS)
  kind!: (typeof SCOPE_KINDS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  refId!: string;
}

export class UpsertBrandActionDto {
  @IsIn(ACTION_KINDS)
  kind!: (typeof ACTION_KINDS)[number];

  @IsOptional()
  @IsIn(ACTION_STATUSES)
  status?: (typeof ACTION_STATUSES)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  targetQty?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  targetAmountUsd?: number | null;

  @IsOptional()
  @IsIn(REWARD_KINDS)
  rewardKind?: (typeof REWARD_KINDS)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rewardUsd?: number | null;

  @IsOptional()
  @IsBoolean()
  notifyRetailers?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BrandActionScopeDto)
  scopes?: BrandActionScopeDto[];
}

export class CreateBrandActionStatusDto {
  @IsIn(["ACTIVE", "ENDED", "CANCELLED"])
  status!: "ACTIVE" | "ENDED" | "CANCELLED";
}

export class UpdateBrandLandingDto {
  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  about?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  heroUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  websiteUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supportEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  supportPhone?: string | null;

  @IsOptional()
  @IsArray()
  blocks?: unknown;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  html?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  primaryColor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  backgroundColor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  textColor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fontFamily?: string | null;
}

export class UpsertBrandSignalDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  externalId!: string;

  @IsOptional()
  @IsIn(["GREEN", "YELLOW", "RED", "BLUE", "GRAY"])
  light?: "GREEN" | "YELLOW" | "RED" | "BLUE" | "GRAY";

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  suggestedPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  qtyEstimate?: number | null;

  @IsOptional()
  @IsDateString()
  incomingAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class ImportBrandSignalsDto {
  @IsString()
  @MinLength(10)
  csv!: string;
}

export class UpsertBrandResourceDto {
  @IsIn(["MATERIAL", "TRAINING"])
  kind!: "MATERIAL" | "TRAINING";

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  type!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  contentUrl?: string | null;
}

export class PostBrandNoteDto {
  @IsUUID()
  retailerTenantId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  body!: string;
}
