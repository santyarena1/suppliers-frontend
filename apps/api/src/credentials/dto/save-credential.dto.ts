import { IsIn, IsObject } from "class-validator";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";

export class SaveCredentialDto {
  @IsIn(ALL_PROVIDERS)
  providerName!: Provider;

  @IsObject()
  credentials!: Record<string, string>;
}
