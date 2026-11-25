import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from "class-validator";

export class DiscountRuleDto {
  @IsIn(["CATEGORY", "BRAND"])
  kind!: "CATEGORY" | "BRAND";

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsNumber()
  @Min(0)
  @Max(90)
  percent!: number;
}

export class CartLinkItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  externalId!: string;

  @IsNumber()
  @Min(1)
  @Max(999)
  qty!: number;
}

export class CartLinkDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CartLinkItemDto)
  items!: CartLinkItemDto[];
}

export class SetDiscountsDto {
  /** Descuento general sobre todo el catálogo. `null` = sin descuento general. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(90)
  general!: number | null;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DiscountRuleDto)
  rules!: DiscountRuleDto[];
}
