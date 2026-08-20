import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { FastifyRequest } from "fastify";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CredentialsService } from "../credentials/credentials.service";
import { ProvidersService } from "./providers.service";
import { FileImportService } from "./file-import.service";
import { InvidAccountService } from "./invid-account.service";
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
  constructor(
    private readonly providersService: ProvidersService,
    private readonly fileImportService: FileImportService,
    private readonly credentialsService: CredentialsService,
    private readonly invidAccountService: InvidAccountService
  ) {}

  /** Historial real de pedidos de Invid (solo lectura) — usa la credencial del portal ya guardada. */
  @Get("providers/INVID/orders")
  async invidOrders(@CurrentUser() user: { userId: string }) {
    const stored = await this.credentialsService.getByProvider(user.userId, "INVID");
    const credentials = JSON.parse(stored.credentialsJson) as Record<string, string>;
    return this.invidAccountService.getOrders(credentials);
  }

  /** Saldo y movimientos reales de cuenta corriente de Invid (solo lectura). */
  @Get("providers/INVID/account-statement")
  async invidAccountStatement(@CurrentUser() user: { userId: string }) {
    const stored = await this.credentialsService.getByProvider(user.userId, "INVID");
    const credentials = JSON.parse(stored.credentialsJson) as Record<string, string>;
    return this.invidAccountService.getAccountStatement(credentials);
  }

  @Post("providers/:provider/sync")
  sync(@CurrentUser() user: { userId: string }, @Param("provider") provider: string) {
    return this.providersService.sync(user.userId, assertProvider(provider));
  }

  /**
   * Alternativa a la sync por API cuando el proveedor limita muy fuerte
   * (ej. AIR a 1 req/5min): el usuario exporta el catálogo a Excel/CSV
   * desde el propio portal del proveedor y lo sube acá. Mismo pipeline de
   * guardado (markup, stock mínimo, historial de precio) que un sync real.
   */
  @Post("providers/:provider/import")
  async importFile(@CurrentUser() user: { userId: string }, @Param("provider") provider: string, @Req() req: FastifyRequest) {
    const prov = assertProvider(provider);
    const file = await req.file();
    if (!file) throw new BadRequestException("No se recibió ningún archivo");
    const buffer = await file.toBuffer();

    const rows = this.fileImportService.parseFile(buffer, file.filename);
    const { items, skipped, unmappedColumns } = this.fileImportService.mapRows(rows);
    if (items.length === 0) {
      throw new BadRequestException(
        "No se pudo mapear ninguna fila (hace falta al menos una columna de código/SKU y una de nombre/descripción)."
      );
    }

    const result = await this.providersService.importFromRows(user.userId, prov, items);
    return { ...result, rowsInFile: rows.length, rowsSkipped: skipped, unmappedColumns };
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
