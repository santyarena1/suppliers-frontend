import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

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

export class NewBytesCheckoutCartDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => NewBytesDraftItemDto)
  items!: NewBytesDraftItemDto[];
}

export class NewBytesCheckoutShippingDto extends NewBytesCheckoutCartDto {
  @IsString()
  @MinLength(1)
  addressId!: string;
}

export class NewBytesCheckoutPreviewDto extends NewBytesCheckoutCartDto {
  @IsIn(["pickup", "shipping"])
  delivery!: "pickup" | "shipping";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  medioDePagoId?: number;

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

  @IsOptional()
  @IsBoolean()
  dropShipping?: boolean;

  @IsOptional()
  @IsString()
  dropShippingClientName?: string;

  @IsOptional()
  @IsString()
  dropShippingClientEmail?: string;
}

export class NewBytesCheckoutDraftDto extends NewBytesCheckoutPreviewDto {
  @Type(() => Number)
  @IsInt()
  medioDePagoId!: number;

  @IsOptional()
  @IsBoolean()
  background?: boolean;
}
