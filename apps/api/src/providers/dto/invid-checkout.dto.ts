import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from "class-validator";

export class InvidDraftItemDto {
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

export class InvidCheckoutPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvidDraftItemDto)
  items!: InvidDraftItemDto[];

  @IsString()
  @MinLength(1)
  addressId!: string;

  @IsIn(["-1", "67", "69", "107"])
  paymentOption!: string;

  @IsOptional()
  @IsString()
  deliveryOption?: string;
}

export class InvidCheckoutDraftDto extends InvidCheckoutPreviewDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  payerName?: string;

  @IsOptional()
  @IsString()
  payerEmail?: string;
}
