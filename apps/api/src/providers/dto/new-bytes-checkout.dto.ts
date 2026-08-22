import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from "class-validator";

export class NewBytesDraftItemDto {
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

export class NewBytesCheckoutPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => NewBytesDraftItemDto)
  items!: NewBytesDraftItemDto[];

  @Type(() => Number)
  @IsInt()
  medioDePagoId!: number;

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  medioDeEnvioId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class NewBytesCheckoutDraftDto extends NewBytesCheckoutPreviewDto {
  @IsOptional()
  @IsString()
  dropShippingClientName?: string;

  @IsOptional()
  @IsString()
  dropShippingClientEmail?: string;
}
