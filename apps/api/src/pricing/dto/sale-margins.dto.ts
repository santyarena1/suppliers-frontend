import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { SALE_MARGIN_MAX, SALE_MARGIN_MIN, type SaleMarginBase } from "@nodo/shared";
import { MAX_BULK } from "../sale-margins.service";

/** `null` = quitar la regla y volver a heredar. */
function percentRules() {
  return [ValidateIf((_o, v) => v !== null), IsNumber(), Min(SALE_MARGIN_MIN), Max(SALE_MARGIN_MAX)];
}

function applyAll(decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => decorators.forEach((d) => d(target, key));
}

const Percent = () => applyAll(percentRules());

export class SetStoreMarginDto {
  @IsOptional()
  @Percent()
  storePercent?: number | null;
}

export class SetProviderMarginsDto {
  @IsOptional()
  @IsIn(["FINAL", "NET"])
  base?: SaleMarginBase;

  @IsOptional()
  @Percent()
  providerPercent?: number | null;
}

export class SetCategoryMarginsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  keys!: string[];

  @Percent()
  percent!: number | null;
}

export class SetProductMarginsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  externalIds!: string[];

  @Percent()
  percent!: number | null;
}

export class SetMarginByCategoryDto {
  @IsString()
  @MaxLength(300)
  category!: string;

  @Percent()
  percent!: number | null;
}
