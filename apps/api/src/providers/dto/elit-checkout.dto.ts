import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from "class-validator";

export class ElitDraftItemDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsString()
  name?: string;
}

export class ElitCheckoutPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ElitDraftItemDto)
  items!: ElitDraftItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  warehouse?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  shippingMethod?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  saleCondition?: number;

  @IsOptional()
  @IsString()
  shippingAddress?: string;
}

export class ElitCheckoutDraftDto extends ElitCheckoutPreviewDto {
  @Type(() => Number)
  @IsInt()
  warehouse!: number;

  @IsOptional()
  @IsBoolean()
  background?: boolean;
}
