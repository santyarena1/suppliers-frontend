import { IsIn, IsInt, IsString, Min, Matches } from "class-validator";
import { type Provider, PROVIDER_KEY_PATTERN } from "@nodo/shared";

export class AddCartItemDto {
  @Matches(PROVIDER_KEY_PATTERN, { message: "Proveedor inválido" })
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
}
