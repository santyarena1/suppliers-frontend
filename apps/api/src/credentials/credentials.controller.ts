import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CredentialsService } from "./credentials.service";
import { SaveCredentialDto } from "./dto/save-credential.dto";

function assertProvider(value: string): Provider {
  if (!ALL_PROVIDERS.includes(value as Provider)) {
    throw new BadRequestException(`Proveedor inválido: ${value}`);
  }
  return value as Provider;
}

@UseGuards(AuthGuard("jwt"))
@Controller("credentials")
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Get("me")
  mine(@CurrentUser() user: { userId: string }) {
    return this.credentialsService.mine(user.userId);
  }

  @Get(":providerName")
  getByProvider(@CurrentUser() user: { userId: string }, @Param("providerName") providerName: string) {
    return this.credentialsService.getByProvider(user.userId, assertProvider(providerName));
  }

  @Post()
  save(@CurrentUser() user: { userId: string }, @Body() dto: SaveCredentialDto) {
    return this.credentialsService.save(user.userId, dto);
  }

  @Delete(":providerName")
  delete(@CurrentUser() user: { userId: string }, @Param("providerName") providerName: string) {
    return this.credentialsService.delete(user.userId, assertProvider(providerName));
  }
}
