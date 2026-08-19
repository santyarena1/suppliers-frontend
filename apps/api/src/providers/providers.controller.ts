import { BadRequestException, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ProvidersService } from "./providers.service";

function assertProvider(value: string): Provider {
  if (!ALL_PROVIDERS.includes(value as Provider)) {
    throw new BadRequestException(`Proveedor inválido: ${value}`);
  }
  return value as Provider;
}

@UseGuards(AuthGuard("jwt"))
@Controller()
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Post("providers/:provider/sync")
  sync(@CurrentUser() user: { userId: string }, @Param("provider") provider: string) {
    return this.providersService.sync(user.userId, assertProvider(provider));
  }

  @Get("search/provider/:provider")
  search(@Param("provider") provider: string, @Query("name") name = "") {
    return this.providersService.search(assertProvider(provider), name);
  }
}
