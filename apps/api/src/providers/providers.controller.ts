import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ProvidersService } from "./providers.service";
import { UpdateProviderConfigDto } from "./dto/update-config.dto";

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

  @Get("providers/:provider/status")
  status(@CurrentUser() user: { userId: string }, @Param("provider") provider: string) {
    return this.providersService.status(user.userId, assertProvider(provider));
  }

  @Get("providers/:provider/config")
  getConfig(@CurrentUser() user: { userId: string }, @Param("provider") provider: string) {
    return this.providersService.getConfig(user.userId, assertProvider(provider));
  }

  @Put("providers/:provider/config")
  updateConfig(
    @CurrentUser() user: { userId: string },
    @Param("provider") provider: string,
    @Body() dto: UpdateProviderConfigDto
  ) {
    return this.providersService.updateConfig(user.userId, assertProvider(provider), dto);
  }

  @Post("providers/:provider/clear-zero-stock")
  clearZeroStock(@Param("provider") provider: string) {
    return this.providersService.clearZeroStock(assertProvider(provider));
  }

  @Delete("providers/:provider/products")
  deleteAllProducts(@Param("provider") provider: string) {
    return this.providersService.deleteAllProducts(assertProvider(provider));
  }

  @Get("search/provider/:provider")
  search(@Param("provider") provider: string, @Query("name") name = "") {
    return this.providersService.search(assertProvider(provider), name);
  }

  @Get("providers/:provider/products/:externalId")
  async getProduct(@Param("provider") provider: string, @Param("externalId") externalId: string) {
    const product = await this.providersService.getProduct(assertProvider(provider), externalId);
    if (!product) throw new NotFoundException("Producto no encontrado");
    return product;
  }

  @Get("providers/:provider/products/:externalId/price-history")
  getPriceHistory(@Param("provider") provider: string, @Param("externalId") externalId: string) {
    return this.providersService.getPriceHistory(assertProvider(provider), externalId);
  }

  @Get("catalog/categories")
  getCategories() {
    return this.providersService.getCategories();
  }

  @Get("catalog/featured")
  getFeatured(@Query("take") take?: string) {
    return this.providersService.getFeatured(take ? Number(take) : 24);
  }

  @Get("catalog/by-category")
  getByCategory(@Query("category") category: string, @Query("take") take?: string) {
    if (!category) throw new BadRequestException("Falta el parámetro category");
    return this.providersService.getByCategory(category, take ? Number(take) : 60);
  }
}
