import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const LIST_SORTS = ["relevance", "name", "-name", "price", "-price", "updatedAt", "-updatedAt"] as const;
export type ListSort = (typeof LIST_SORTS)[number];

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === "true" || value === "1" ? true : value === false || value === "false" || value === "0" ? false : value;

/** Filtros, orden y paginación de /v1/products y /v1/offers. */
export class ListQueryDto {
  @ApiPropertyOptional({ description: "Texto a buscar en nombre, marca, SKU, part number o EAN. Todas las palabras tienen que aparecer.", example: "rtx 4060" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: "Marca (nombre o id `brd_…`).", example: "ASUS" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @ApiPropertyOptional({ description: "Categoría (nombre o id `cat_…`).", example: "Placas de video" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ description: "Subcategoría (nombre o id `cat_…`)." })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subcategory?: string;

  @ApiPropertyOptional({ description: "Distribuidor (id `prv_…`; con identidad visible, también la clave).", example: "prv_3kT9xQ2mWvLp0aZr" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @ApiPropertyOptional({ description: "Solo con stock (`true`) o solo sin stock (`false`). Sin stock solo aparece si la key lo incluye." })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ description: "Precio mínimo (precio de venta final en la moneda de la key).", example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: "Precio máximo (precio de venta final en la moneda de la key).", example: 2500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: "Solo lo que cambió desde esta fecha (ISO 8601).", example: "2026-10-01T00:00:00Z" })
  @IsOptional()
  @IsISO8601()
  updatedSince?: string;

  @ApiPropertyOptional({ description: "EAN / GTIN exacto.", example: "4711081976386" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ean?: string;

  @ApiPropertyOptional({ description: "Part number exacto (sin distinguir mayúsculas, espacios ni guiones).", example: "DUAL-RTX4060-O8G" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  partNumber?: string;

  @ApiPropertyOptional({ enum: LIST_SORTS, description: "Orden. `-` adelante = descendente. `relevance` solo tiene sentido con `q` (default con `q`; sin `q` el default es `name`)." })
  @IsOptional()
  @IsIn(LIST_SORTS as unknown as string[])
  sort?: ListSort;

  @ApiPropertyOptional({ description: "Cantidad por página (1 a 500).", default: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ description: "Cursor de `pagination.nextCursor` de la página anterior." })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  cursor?: string;
}
