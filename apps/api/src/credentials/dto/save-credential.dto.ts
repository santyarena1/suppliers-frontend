import { IsIn, IsObject, Matches } from "class-validator";
import { type Provider, PROVIDER_KEY_PATTERN } from "@nodo/shared";

export class SaveCredentialDto {
  @Matches(PROVIDER_KEY_PATTERN, { message: "Proveedor inválido" })
  providerName!: Provider;

  @IsObject()
  credentials!: Record<string, string>;
}
