import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export class SetOwnStoreDto {
  /** `null` suelta la tienda propia. */
  @IsDefined()
  @ValidateIf((_obj, value) => value !== null)
  @IsUUID()
  retailStoreId!: string | null;
}

export class OwnStoreQuoteItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  name!: string;
}

export class OwnStoreQuotesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => OwnStoreQuoteItemDto)
  items!: OwnStoreQuoteItemDto[];
}
