import { IsIn, IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";

export class AddCartItemDto {
  @IsIn(ALL_PROVIDERS)
  provider!: Provider;

  @IsString()
  externalId!: string;

  @IsString()
  name!: string;

  @IsString()
  price!: string;

  @IsString()
  imageUrl!: string;

  @IsInt()
  @Min(1)
  quantity: number = 1;

  /** Ficha compacta del producto para armar el pedido en el otro dispositivo. */
  @IsOptional()
  @IsObject()
  snapshot?: Record<string, unknown>;
}
