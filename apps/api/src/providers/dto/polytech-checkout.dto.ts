import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class PolytechDraftItemDto {
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

export class PolytechCheckoutPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PolytechDraftItemDto)
  items!: PolytechDraftItemDto[];

  @IsOptional()
  @IsIn(["delivery", "pickup"])
  shippingService?: "delivery" | "pickup";

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsOptional()
  @IsString()
  courierId?: string;

  @IsOptional()
  @IsIn(["mercadopago"])
  paymentMethod?: "mercadopago";

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class PolytechCheckoutDraftDto extends PolytechCheckoutPreviewDto {
  @IsOptional()
  @IsBoolean()
  background?: boolean;
}
