import { IsString, MaxLength } from "class-validator";

export class MergeProvidersDto {
  /** Clave del proveedor por lista duplicado (LIST_*). */
  @IsString()
  @MaxLength(60)
  from!: string;

  /** Clave del proveedor que queda. */
  @IsString()
  @MaxLength(60)
  into!: string;
}
