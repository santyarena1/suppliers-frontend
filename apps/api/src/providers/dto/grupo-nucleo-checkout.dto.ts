import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export const GN_DOC_TYPES = [80, 86, 96] as const;
export const GN_PROVINCE_CODES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24,
] as const;

export class GrupoNucleoDraftItemDto {
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

export class GrupoNucleoCheckoutPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GrupoNucleoDraftItemDto)
  items!: GrupoNucleoDraftItemDto[];

  @IsOptional()
  @IsBoolean()
  customerSale?: boolean;
}

export class GrupoNucleoCustomerDto {
  @IsString()
  @MinLength(1)
  nombre!: string;

  @IsString()
  @MinLength(1)
  documento!: string;

  @Type(() => Number)
  @IsInt()
  @IsIn(GN_DOC_TYPES)
  tipoDocumento!: number;

  @IsString()
  @MinLength(1)
  direccion!: string;

  @IsString()
  @MinLength(1)
  codigoPostal!: string;

  @IsString()
  @MinLength(1)
  ciudad!: string;

  @Type(() => Number)
  @IsInt()
  @IsIn(GN_PROVINCE_CODES)
  codProvincia!: number;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  tel!: string;
}

export class GrupoNucleoCheckoutDraftDto extends GrupoNucleoCheckoutPreviewDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GrupoNucleoCustomerDto)
  customer?: GrupoNucleoCustomerDto;

  @IsOptional()
  @IsBoolean()
  background?: boolean;
}
