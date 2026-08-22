import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { FastifyRequest } from "fastify";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CredentialsService } from "../credentials/credentials.service";
import { ProvidersService } from "./providers.service";
import { FileImportService } from "./file-import.service";
import { InvidAccountService } from "./invid-account.service";
import { InvidOrderService } from "./invid-order.service";
import { NewBytesAccountService } from "./new-bytes-account.service";
import { NewBytesOrderService } from "./new-bytes-order.service";
import { GrupoNucleoOrderService } from "./grupo-nucleo-order.service";
import { AirAccountService } from "./air-account.service";
import { AirOrderService } from "./air-order.service";
import { ElitAccountService } from "./elit-account.service";
import { ElitOrderService } from "./elit-order.service";
import { UpdateProviderConfigDto } from "./dto/update-config.dto";
import { InvidCheckoutDraftDto, InvidCheckoutPreviewDto } from "./dto/invid-checkout.dto";
import {
  NewBytesCheckoutCartDto,
  NewBytesCheckoutDraftDto,
  NewBytesCheckoutPreviewDto,
  NewBytesCheckoutShippingDto,
} from "./dto/new-bytes-checkout.dto";
import { GrupoNucleoCheckoutDraftDto, GrupoNucleoCheckoutPreviewDto } from "./dto/grupo-nucleo-checkout.dto";
import { AirCheckoutDraftDto, AirCheckoutPreviewDto } from "./dto/air-checkout.dto";
import { ElitCheckoutDraftDto, ElitCheckoutPreviewDto } from "./dto/elit-checkout.dto";

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
    private readonly invidAccountService: InvidAccountService,
    private readonly invidOrderService: InvidOrderService,
    private readonly newBytesAccountService: NewBytesAccountService,
    private readonly newBytesOrderService: NewBytesOrderService,
    private readonly grupoNucleoOrderService: GrupoNucleoOrderService,
    private readonly airAccountService: AirAccountService,
    private readonly airOrderService: AirOrderService,
    private readonly elitAccountService: ElitAccountService,
    private readonly elitOrderService: ElitOrderService
  ) {}

  private async invidCredentials(userId: string) {
    const stored = await this.credentialsService.getByProvider(userId, "INVID");
    return JSON.parse(stored.credentialsJson) as Record<string, string>;
  }

  private async newBytesCredentials(userId: string) {
    const stored = await this.credentialsService.getByProvider(userId, "NEW_BYTES");
    return JSON.parse(stored.credentialsJson) as Record<string, string>;
  }

  /** Historial real de pedidos de Invid (solo lectura) — usa la credencial del portal ya guardada. */
  @Get("providers/INVID/orders")
  async invidOrders(@CurrentUser() user: { userId: string }) {
    return this.invidAccountService.getOrders(await this.invidCredentials(user.userId));
  }

  /** Saldo y movimientos reales de cuenta corriente de Invid (solo lectura). */
  @Get("providers/INVID/account-statement")
  async invidAccountStatement(@CurrentUser() user: { userId: string }) {
    return this.invidAccountService.getAccountStatement(await this.invidCredentials(user.userId));
  }

  @Get("providers/INVID/checkout/addresses")
  async invidAddresses(@CurrentUser() user: { userId: string }) {
    return this.invidOrderService.getAddresses(await this.invidCredentials(user.userId));
  }

  @Get("providers/INVID/checkout/payments")
  invidPayments() {
    return this.invidOrderService.paymentOptions();
  }

  @Get("providers/INVID/checkout/deliveries")
  invidDeliveries() {
    return this.invidOrderService.deliveryOptions();
  }

  @Get("providers/INVID/drafts")
  invidDrafts(@CurrentUser() user: { userId: string }) {
    return this.invidOrderService.listDrafts(user.userId);
  }

  @Post("providers/INVID/checkout/preview")
  async invidCheckoutPreview(@CurrentUser() user: { userId: string }, @Body() dto: InvidCheckoutPreviewDto) {
    return this.invidOrderService.preview(await this.invidCredentials(user.userId), dto);
  }

  /** Crea el borrador en Invid (pedido pendiente) y guarda una copia en Nodo. */
  @Post("providers/INVID/checkout/draft")
  async invidCheckoutDraft(@CurrentUser() user: { userId: string }, @Body() dto: InvidCheckoutDraftDto) {
    return this.invidOrderService.submitDraft(user.userId, await this.invidCredentials(user.userId), dto);
  }

  /** Historial real de pedidos web de NewBytes (solo lectura). */
  @Get("providers/NEW_BYTES/orders")
  async newBytesOrders(@CurrentUser() user: { userId: string }) {
    return this.newBytesAccountService.getOrders(await this.newBytesCredentials(user.userId));
  }

  /** Órdenes de compra reales de NewBytes (las que genera el checkout). */
  @Get("providers/NEW_BYTES/purchase-orders")
  async newBytesPurchaseOrders(@CurrentUser() user: { userId: string }) {
    return this.newBytesAccountService.getPurchaseOrders(await this.newBytesCredentials(user.userId));
  }

  /** Comprobantes / cuenta corriente de NewBytes (solo lectura). */
  @Get("providers/NEW_BYTES/account-statement")
  async newBytesAccountStatement(@CurrentUser() user: { userId: string }) {
    return this.newBytesAccountService.getAccountStatement(await this.newBytesCredentials(user.userId));
  }

  @Get("providers/NEW_BYTES/profile")
  async newBytesProfile(@CurrentUser() user: { userId: string }) {
    return this.newBytesAccountService.getProfile(await this.newBytesCredentials(user.userId));
  }

  @Get("providers/NEW_BYTES/checkout/addresses")
  async newBytesAddresses(@CurrentUser() user: { userId: string }) {
    return this.newBytesOrderService.getAddresses(await this.newBytesCredentials(user.userId));
  }

  @Get("providers/NEW_BYTES/checkout/payments")
  async newBytesPayments(@CurrentUser() user: { userId: string }) {
    return this.newBytesOrderService.getPayments(await this.newBytesCredentials(user.userId));
  }

  @Get("providers/NEW_BYTES/drafts")
  newBytesDrafts(@CurrentUser() user: { userId: string }) {
    return this.newBytesOrderService.listDrafts(user.userId);
  }

  /** POST /carrito/new + items. Devuelve el carrito real de NewBytes (subtotales / availability). */
  @Post("providers/NEW_BYTES/checkout/cart")
  async newBytesCheckoutCart(@CurrentUser() user: { userId: string }, @Body() dto: NewBytesCheckoutCartDto) {
    return this.newBytesOrderService.syncCart(await this.newBytesCredentials(user.userId), dto);
  }

  /** GET /carrito/calcularEnvioPara/{cp}/{idDirCli} sobre el carrito armado. */
  @Post("providers/NEW_BYTES/checkout/shipping")
  async newBytesCheckoutShipping(@CurrentUser() user: { userId: string }, @Body() dto: NewBytesCheckoutShippingDto) {
    return this.newBytesOrderService.quoteShippingForAddress(await this.newBytesCredentials(user.userId), dto);
  }

  @Post("providers/NEW_BYTES/checkout/preview")
  async newBytesCheckoutPreview(@CurrentUser() user: { userId: string }, @Body() dto: NewBytesCheckoutPreviewDto) {
    return this.newBytesOrderService.preview(await this.newBytesCredentials(user.userId), dto);
  }

  /** POST /carrito/process: retiro ({ note, medioDePagoId }) o envío (cotización + idDirCli). */
  @Post("providers/NEW_BYTES/checkout/draft")
  async newBytesCheckoutDraft(@CurrentUser() user: { userId: string }, @Body() dto: NewBytesCheckoutDraftDto) {
    return this.newBytesOrderService.submitDraft(user.userId, await this.newBytesCredentials(user.userId), dto);
  }

  private async credentialsOf(userId: string, provider: Provider) {
    const stored = await this.credentialsService.getByProvider(userId, provider);
    return JSON.parse(stored.credentialsJson) as Record<string, string>;
  }

  @Get("providers/GRUPO_NUCLEO/checkout/options")
  gnCheckoutOptions() {
    return this.grupoNucleoOrderService.checkoutOptions();
  }

  @Get("providers/GRUPO_NUCLEO/drafts")
  gnDrafts(@CurrentUser() user: { userId: string }) {
    return this.grupoNucleoOrderService.listDrafts(user.userId);
  }

  /** La API de GN no expone historial/cta cte — devolvemos copias de Nodo. */
  @Get("providers/GRUPO_NUCLEO/account")
  gnAccount(@CurrentUser() user: { userId: string }) {
    return this.grupoNucleoOrderService.getAccount(user.userId);
  }

  @Post("providers/GRUPO_NUCLEO/checkout/preview")
  async gnPreview(@CurrentUser() user: { userId: string }, @Body() dto: GrupoNucleoCheckoutPreviewDto) {
    return this.grupoNucleoOrderService.preview(await this.credentialsOf(user.userId, "GRUPO_NUCLEO"), dto);
  }

  @Post("providers/GRUPO_NUCLEO/checkout/draft")
  async gnDraft(@CurrentUser() user: { userId: string }, @Body() dto: GrupoNucleoCheckoutDraftDto) {
    return this.grupoNucleoOrderService.submitDraft(
      user.userId,
      await this.credentialsOf(user.userId, "GRUPO_NUCLEO"),
      dto
    );
  }

  @Get("providers/AIR/checkout/options")
  async airCheckoutOptions(@CurrentUser() user: { userId: string }) {
    return this.airOrderService.checkoutOptions(await this.credentialsOf(user.userId, "AIR"));
  }

  @Get("providers/AIR/drafts")
  airDrafts(@CurrentUser() user: { userId: string }) {
    return this.airOrderService.listDrafts(user.userId);
  }

  @Get("providers/AIR/account")
  async airAccount(@CurrentUser() user: { userId: string }) {
    return this.airAccountService.getAccount(user.userId, await this.credentialsOf(user.userId, "AIR"));
  }

  @Post("providers/AIR/checkout/preview")
  async airPreview(@CurrentUser() user: { userId: string }, @Body() dto: AirCheckoutPreviewDto) {
    return this.airOrderService.preview(await this.credentialsOf(user.userId, "AIR"), {
      items: dto.items,
      sucursal: dto.sucursal ?? "",
      vendedor: dto.vendedor ?? "",
      pago: dto.pago ?? "01",
      entrega: dto.entrega ?? "01",
      transporte: dto.transporte,
      notes: dto.notes,
    });
  }

  @Post("providers/AIR/checkout/draft")
  async airDraft(@CurrentUser() user: { userId: string }, @Body() dto: AirCheckoutDraftDto) {
    return this.airOrderService.submitDraft(user.userId, await this.credentialsOf(user.userId, "AIR"), dto);
  }

  @Get("providers/ELIT/drafts")
  elitDrafts(@CurrentUser() user: { userId: string }) {
    return this.elitOrderService.listDrafts(user.userId);
  }

  @Get("providers/ELIT/account")
  async elitAccount(@CurrentUser() user: { userId: string }) {
    return this.elitAccountService.getAccount(user.userId, await this.credentialsOf(user.userId, "ELIT"));
  }

  @Post("providers/ELIT/checkout/preview")
  async elitPreview(@CurrentUser() user: { userId: string }, @Body() dto: ElitCheckoutPreviewDto) {
    return this.elitOrderService.preview(await this.credentialsOf(user.userId, "ELIT"), dto);
  }

  @Post("providers/ELIT/checkout/draft")
  async elitDraft(@CurrentUser() user: { userId: string }, @Body() dto: ElitCheckoutDraftDto) {
    return this.elitOrderService.submitDraft(user.userId, await this.credentialsOf(user.userId, "ELIT"), dto);
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
