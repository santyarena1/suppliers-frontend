import { IsArray, IsOptional, IsString, MaxLength } from "class-validator";

export class UpsertOrgCartDto {
  @IsArray()
  items!: unknown[];

  @IsOptional()
  @IsArray()
  schemes?: unknown[];

  /**
   * `updatedAt` del carrito sobre el que se hizo el cambio (`null` = no había).
   * Si en el servidor ya hay otro, responde 409 con el actual para que la web
   * junte los dos en vez de pisar lo que guardó otra pestaña, PC o persona.
   * Sin el campo (versión vieja de la web) se guarda como antes.
   */
  @IsOptional()
  @IsString()
  baseUpdatedAt?: string | null;

  /** Pestaña que guarda: vuelve en `cart_updated` para que esa misma pestaña lo ignore. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string;
}
