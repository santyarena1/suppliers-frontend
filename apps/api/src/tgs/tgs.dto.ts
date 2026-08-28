import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class TgsPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;
}

export class TgsClientesQueryDto extends TgsPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class TgsStockQueryDto extends TgsPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  local_id?: number;
}

export class TgsVentasQueryDto extends TgsPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  desde?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  hasta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  estado?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  local_id?: number;
}

export class TgsComprasQueryDto extends TgsPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class TgsOrdenesQueryDto extends TgsPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  estado?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cliente_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class TgsRmaQueryDto extends TgsPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  estado?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cliente_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class TgsCtaCteQueryDto extends TgsPageQueryDto {}

export class TgsPatchStockDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precio?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock?: number;
}

export class TgsCreateRmaDto {
  @IsString()
  @MaxLength(2000)
  falla_reportada!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  producto_nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  producto_serie?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cliente_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  venta_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  venta_numero?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orden_trabajo_id?: number;
}
