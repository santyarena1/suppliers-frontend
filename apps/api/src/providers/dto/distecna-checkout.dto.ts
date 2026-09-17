import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

export class DistecnaDraftItemDto {
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

  @IsOptional()
  @IsString()
  type?: string;
}

export class DistecnaCheckoutPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DistecnaDraftItemDto)
  items!: DistecnaDraftItemDto[];

  @IsOptional()
  @IsString()
  paymentTermId?: string;

  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class DistecnaCheckoutDraftDto extends DistecnaCheckoutPreviewDto {
  @IsOptional()
  @IsBoolean()
  background?: boolean;
}
