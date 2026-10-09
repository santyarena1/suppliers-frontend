import { Transform, Type } from "class-transformer";
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
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { PROPOSAL_FIELDS } from "../proposal-builder";

const toBool = ({ value }: { value: unknown }) => (value === undefined || value === "" ? undefined : value === true || value === "true" || value === "1");

export const MASTER_STATUSES = ["NEW", "ENRICHING", "ENRICHED", "REVIEW", "FAILED"] as const;

/** Filtros de la lista de maestros (también definen el alcance de una corrida "por filtro"). */
export class MasterFilterDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider?: string;

  @IsOptional()
  @IsIn(MASTER_STATUSES)
  status?: (typeof MASTER_STATUSES)[number];

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  hasAiImage?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  missingDescription?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  doubtful?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  multiProvider?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  maxConfidence?: number;
}

export class ListMastersQueryDto extends MasterFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(["name", "members", "confidence", "updated"])
  sort?: "name" | "members" | "confidence" | "updated";
}

export class StartRunDto {
  @IsIn(["sample", "filter", "ids"])
  kind!: "sample" | "filter" | "ids";

  @IsOptional()
  @ValidateNested()
  @Type(() => MasterFilterDto)
  filter?: MasterFilterDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID("4", { each: true })
  masterIds?: string[];

  /** Tope de productos de la corrida. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25000)
  maxItems!: number;

  /** Tope de costo de IA estimado (USD). Al llegar, la corrida sigue sin IA. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  maxCostUsd!: number;

  /** Solo maestros que nunca se enriquecieron. */
  @IsOptional()
  @IsBoolean()
  onlyNew?: boolean;
}

export class DecideDto {
  @IsIn(["APPROVED", "REJECTED", "PENDING"])
  decision!: "APPROVED" | "REJECTED" | "PENDING";
}

export class BulkDecideDto {
  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence!: number;

  @IsOptional()
  @IsIn(PROPOSAL_FIELDS)
  field?: (typeof PROPOSAL_FIELDS)[number];

  @IsOptional()
  @ValidateNested()
  @Type(() => MasterFilterDto)
  filter?: MasterFilterDto;

  /** Sin esto, solo devuelve cuántas propuestas tocaría. */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class MemberRefDto {
  @IsString()
  @MaxLength(60)
  provider!: string;

  @IsString()
  @MaxLength(200)
  externalId!: string;
}

export class SplitDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MemberRefDto)
  members!: MemberRefDto[];
}

export class MergeDto {
  @IsUUID("4")
  targetId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID("4", { each: true })
  sourceIds!: string[];
}

export const PROPOSAL_FIELD_VALUES = PROPOSAL_FIELDS;
