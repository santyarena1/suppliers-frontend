import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { ALL_PROVIDERS } from "@nodo/shared";

export class OfflineOrderItemDto {
  @IsString()
  @MaxLength(120)
  externalId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsString()
  @MaxLength(500)
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(9999)
  qty!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  internosAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ivaPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  internosPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  finalLineUsd?: number;

  @IsOptional()
  @IsIn(["list", "scheme", "offline"])
  pricingMode?: "list" | "scheme" | "offline";

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  listUnitPrice?: number;

  @IsOptional()
  @IsBoolean()
  edited?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  editedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  originalUnitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  originalFinalLineUsd?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  editNote?: string;
}

export class OfflineOrderGroupDto {
  @IsIn(ALL_PROVIDERS as unknown as string[])
  provider!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quoteRate?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OfflineOrderItemDto)
  items!: OfflineOrderItemDto[];
}

export class CreateOfflineOrdersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OfflineOrderGroupDto)
  orders!: OfflineOrderGroupDto[];
}

export class UpdateOfflineOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OfflineOrderItemDto)
  items?: OfflineOrderItemDto[];
}
