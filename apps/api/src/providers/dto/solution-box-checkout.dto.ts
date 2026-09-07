import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

export class SolutionBoxDraftItemDto {
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

export class SolutionBoxCheckoutPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SolutionBoxDraftItemDto)
  items!: SolutionBoxDraftItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  paymentCondition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  deliveryType?: string;
}

export class SolutionBoxCheckoutDraftDto extends SolutionBoxCheckoutPreviewDto {
  @IsOptional()
  @IsBoolean()
  background?: boolean;
}
