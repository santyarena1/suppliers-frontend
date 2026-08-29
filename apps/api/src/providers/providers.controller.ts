import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { FastifyRequest } from "fastify";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";
import { CurrentTenant, CurrentTenantOrNone } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { CredentialsService } from "../credentials/credentials.service";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { TENANT_ROLES_CAN_PURGE_CATALOG } from "@nodo/shared";
import { assertTenantRole } from "../tenants/tenant-roles";
import { TenantGuard } from "../tenants/tenant.guard";
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
import { OrderApprovalService } from "../orders/order-approval.service";
import type { OrderAuthor } from "./provider-draft";
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
import { ElitPaymentOperationDto } from "./dto/elit-payment.dto";
import { AccountPortalCache, wantsRefresh } from "./account-portal-cache";
import { parseIncludeOutOfStock } from "./catalog-stock";

function assertProvider(value: string): Provider {
  if (!ALL_PROVIDERS.includes(value as Provider)) {
    throw new BadRequestException(`Proveedor inválido: ${value}`);
  }
  return value as Provider;
}

// `RolesGuard` deja pasar todo lo que no declare `@Roles`, así que sumarlo acá no
// restringe nada por sí solo: habilita marcar endpoints sueltos.
@UseGuards(AuthGuard("jwt"), RolesGuard, TenantGuard)
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
    private readonly elitOrderService: ElitOrderService,
    private readonly orderApproval: OrderApprovalService,
    private readonly accountCache: AccountPortalCache
  ) {}

  /**
   * Un vendedor arma el pedido pero no lo confirma: queda guardado esperando que
   * lo apruebe el dueño. Para el resto, `hold` devuelve `null` y el checkout sigue.
   */
  private hold(tenant: TenantContext, userId: string, provider: Provider, draft: { items?: unknown; notes?: string }) {
    return this.orderApproval.hold(tenant, userId, provider, draft);
  }

  private author(user: { userId: string }, tenant: TenantContext): OrderAuthor {
    return { userId: user.userId, tenantId: tenant.tenantId };
  }

  // Las credenciales son de la organización: quien las pide es el comercio, no la
  // persona que las cargó.
  private async invidCredentials(tenant: TenantContext) {
    const stored = await this.credentialsService.getByProvider(commercialId(tenant), "INVID");
    return JSON.parse(stored.credentialsJson) as Record<string, string>;
  }

  private async newBytesCredentials(tenant: TenantContext) {
    const stored = await this.credentialsService.getByProvider(commercialId(tenant), "NEW_BYTES");
    return JSON.parse(stored.credentialsJson) as Record<string, string>;
  }

  /** Historial real de pedidos de Invid (solo lectura) — usa la credencial del portal ya guardada. */
  @Get("providers/INVID/orders")
  async invidOrders(
    @CurrentTenant() tenant: TenantContext,
    @Query("refresh") refresh?: string
  ) {
    const key = `${tenant.tenantId}:INVID:orders`;
    return this.accountCache.wrap(key, wantsRefresh(refresh), async () =>
      this.invidAccountService.getOrders(await this.invidCredentials(tenant))
    );
  }

  /** Saldo y movimientos reales de cuenta corriente de Invid (solo lectura). */
  @Get("providers/INVID/account-statement")
  async invidAccountStatement(
    @CurrentTenant() tenant: TenantContext,
    @Query("refresh") refresh?: string
  ) {
    const key = `${tenant.tenantId}:INVID:cta`;
    return this.accountCache.wrap(key, wantsRefresh(refresh), async () =>
      this.invidAccountService.getAccountStatement(await this.invidCredentials(tenant))
    );
  }

  @Get("providers/INVID/documents")
  async invidDocument(@CurrentTenant() tenant: TenantContext, @Query("href") href: string) {
    return this.invidAccountService.getDocument(await this.invidCredentials(tenant), href);
  }

  @Post("providers/INVID/payments/attach")
  async invidPaymentAttach(@CurrentTenant() tenant: TenantContext, @Req() req: FastifyRequest) {
    const files: { field: string; filename: string; mimetype: string; buffer: Buffer }[] = [];
    const extra: Record<string, string> = {};
    for await (const part of req.parts()) {
      if (part.type === "file") {
        if (!part.filename) continue;
        files.push({
          field: part.fieldname,
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer(),
        });
      } else {
        extra[part.fieldname] = String(part.value ?? "");
      }
    }
    if (files.length === 0) throw new BadRequestException("No se recibió ningún archivo");
    const bank = extra.bank || extra.banco;
    const notes = extra.notes || extra.observaciones;
    if (!bank?.trim()) throw new BadRequestException("Elegí el banco");
    if (!notes?.trim()) throw new BadRequestException("Completá las observaciones");
    extra.bank = bank;
    extra.notes = notes;
    return this.invidAccountService.attachPayment(
      await this.invidCredentials(tenant),
      files,
      extra
    );
  }

  @Get("providers/INVID/checkout/addresses")
  async invidAddresses(@CurrentTenant() tenant: TenantContext) {
    return this.invidOrderService.getAddresses(await this.invidCredentials(tenant));
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
  invidDrafts(@CurrentTenant() tenant: TenantContext) {
    return this.invidOrderService.listDrafts(tenant.tenantId);
  }

  @Get("providers/INVID/drafts/:id")
  async invidDraft(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    const draft = await this.invidOrderService.getDraft(tenant.tenantId, id);
    if (!draft) throw new NotFoundException("Borrador no encontrado");
    return draft;
  }

  @Post("providers/INVID/checkout/preview")
  async invidCheckoutPreview(@CurrentTenant() tenant: TenantContext, @Body() dto: InvidCheckoutPreviewDto) {
    return this.invidOrderService.preview(await this.invidCredentials(tenant), dto);
  }

  /** Crea el borrador en Invid (pedido pendiente) y guarda una copia en Nodo. */
  @Post("providers/INVID/checkout/draft")
  async invidCheckoutDraft(
    @CurrentUser() user: { userId: string },
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: InvidCheckoutDraftDto
  ) {
    const held = await this.hold(tenant, user.userId, "INVID", dto);
    if (held) return held;
    return this.invidOrderService.submitDraft(this.author(user, tenant), await this.invidCredentials(tenant), dto);
  }

  /** Historial real de pedidos web de NewBytes (solo lectura). */
  @Get("providers/NEW_BYTES/orders")
  async newBytesOrders(
    @CurrentTenant() tenant: TenantContext,
    @Query("refresh") refresh?: string
  ) {
    const key = `${tenant.tenantId}:NEW_BYTES:orders`;
    return this.accountCache.wrap(key, wantsRefresh(refresh), async () =>
      this.newBytesAccountService.getOrders(await this.newBytesCredentials(tenant))
    );
  }

  /** Órdenes de compra reales de NewBytes (las que genera el checkout). */
  @Get("providers/NEW_BYTES/purchase-orders")
  async newBytesPurchaseOrders(
    @CurrentTenant() tenant: TenantContext,
    @Query("refresh") refresh?: string
  ) {
    const key = `${tenant.tenantId}:NEW_BYTES:purchase-orders`;
    return this.accountCache.wrap(key, wantsRefresh(refresh), async () =>
      this.newBytesAccountService.getPurchaseOrders(await this.newBytesCredentials(tenant))
    );
  }

  /** Comprobantes / cuenta corriente de NewBytes (solo lectura). */
  @Get("providers/NEW_BYTES/account-statement")
  async newBytesAccountStatement(
    @CurrentTenant() tenant: TenantContext,
    @Query("refresh") refresh?: string
  ) {
    const key = `${tenant.tenantId}:NEW_BYTES:cta`;
    return this.accountCache.wrap(key, wantsRefresh(refresh), async () =>
      this.newBytesAccountService.getAccountStatement(await this.newBytesCredentials(tenant))
    );
  }

  @Get("providers/NEW_BYTES/profile")
  async newBytesProfile(@CurrentTenant() tenant: TenantContext) {
    return this.newBytesAccountService.getProfile(await this.newBytesCredentials(tenant));
  }

  @Get("providers/NEW_BYTES/documents")
  async newBytesDocument(@CurrentTenant() tenant: TenantContext, @Query("voucherId") voucherId: string) {
    return this.newBytesAccountService.getDocument(await this.newBytesCredentials(tenant), voucherId);
  }

  @Get("providers/NEW_BYTES/orders/:id")
  async newBytesOrderDetail(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Query("kind") kind?: string
  ) {
    return this.newBytesAccountService.getOrderDetail(await this.newBytesCredentials(tenant), id, kind);
  }

  @Get("providers/NEW_BYTES/checkout/addresses")
  async newBytesAddresses(@CurrentTenant() tenant: TenantContext) {
    return this.newBytesOrderService.getAddresses(await this.newBytesCredentials(tenant));
  }

  @Get("providers/NEW_BYTES/checkout/payments")
  async newBytesPayments(@CurrentTenant() tenant: TenantContext) {
    return this.newBytesOrderService.getPayments(await this.newBytesCredentials(tenant));
  }

  @Get("providers/NEW_BYTES/drafts")
  newBytesDrafts(@CurrentTenant() tenant: TenantContext) {
    return this.newBytesOrderService.listDrafts(tenant.tenantId);
  }

  @Get("providers/NEW_BYTES/drafts/:id")
  async newBytesDraft(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    const draft = await this.newBytesOrderService.getDraft(tenant.tenantId, id);
    if (!draft) throw new NotFoundException("Pedido no encontrado");
    return draft;
  }

  /** POST /carrito/new + items. Devuelve el carrito real de NewBytes (subtotales / availability). */
  @Post("providers/NEW_BYTES/checkout/cart")
  async newBytesCheckoutCart(@CurrentTenant() tenant: TenantContext, @Body() dto: NewBytesCheckoutCartDto) {
    return this.newBytesOrderService.syncCart(await this.newBytesCredentials(tenant), dto);
  }

  /** GET /carrito/calcularEnvioPara/{cp}/{idDirCli} sobre el carrito armado. */
  @Post("providers/NEW_BYTES/checkout/shipping")
  async newBytesCheckoutShipping(@CurrentTenant() tenant: TenantContext, @Body() dto: NewBytesCheckoutShippingDto) {
    return this.newBytesOrderService.quoteShippingForAddress(await this.newBytesCredentials(tenant), dto);
  }

  @Post("providers/NEW_BYTES/checkout/preview")
  async newBytesCheckoutPreview(@CurrentTenant() tenant: TenantContext, @Body() dto: NewBytesCheckoutPreviewDto) {
    return this.newBytesOrderService.preview(await this.newBytesCredentials(tenant), dto);
  }

  /** POST /carrito/process: retiro ({ note, medioDePagoId }) o envío (cotización + idDirCli). */
  @Post("providers/NEW_BYTES/checkout/draft")
  async newBytesCheckoutDraft(
    @CurrentUser() user: { userId: string },
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: NewBytesCheckoutDraftDto
  ) {
    const held = await this.hold(tenant, user.userId, "NEW_BYTES", dto);
    if (held) return held;
    return this.newBytesOrderService.submitDraft(
      this.author(user, tenant),
      await this.newBytesCredentials(tenant),
      dto
    );
  }

  private async credentialsOf(tenant: TenantContext, provider: Provider) {
    const stored = await this.credentialsService.getByProvider(commercialId(tenant), provider);
    return JSON.parse(stored.credentialsJson) as Record<string, string>;
  }

  @Get("providers/GRUPO_NUCLEO/checkout/options")
  gnCheckoutOptions() {
    return this.grupoNucleoOrderService.checkoutOptions();
  }

  @Get("providers/GRUPO_NUCLEO/drafts")
  gnDrafts(@CurrentTenant() tenant: TenantContext) {
    return this.grupoNucleoOrderService.listDrafts(tenant.tenantId);
  }

  @Get("providers/GRUPO_NUCLEO/drafts/:id")
  async gnDraftById(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    const draft = await this.grupoNucleoOrderService.getDraft(tenant.tenantId, id);
    if (!draft) throw new NotFoundException("Pedido no encontrado");
    return draft;
  }

  /** La API de GN no expone historial/cta cte — devolvemos copias de Nodo. */
  @Get("providers/GRUPO_NUCLEO/account")
  gnAccount(@CurrentTenant() tenant: TenantContext) {
    return this.grupoNucleoOrderService.getAccount(tenant.tenantId);
  }

  @Post("providers/GRUPO_NUCLEO/checkout/preview")
  async gnPreview(@CurrentTenant() tenant: TenantContext, @Body() dto: GrupoNucleoCheckoutPreviewDto) {
    return this.grupoNucleoOrderService.preview(await this.credentialsOf(tenant, "GRUPO_NUCLEO"), dto);
  }

  @Post("providers/GRUPO_NUCLEO/checkout/draft")
  async gnDraft(
    @CurrentUser() user: { userId: string },
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: GrupoNucleoCheckoutDraftDto
  ) {
    const held = await this.hold(tenant, user.userId, "GRUPO_NUCLEO", dto);
    if (held) return held;
    return this.grupoNucleoOrderService.submitDraft(
      this.author(user, tenant),
      await this.credentialsOf(tenant, "GRUPO_NUCLEO"),
      dto
    );
  }

  @Get("providers/AIR/checkout/options")
  async airCheckoutOptions(@CurrentTenant() tenant: TenantContext) {
    return this.airOrderService.checkoutOptions(await this.credentialsOf(tenant, "AIR"));
  }

  @Get("providers/AIR/drafts")
  airDrafts(@CurrentTenant() tenant: TenantContext) {
    return this.airOrderService.listDrafts(tenant.tenantId);
  }

  @Get("providers/AIR/drafts/:id")
  async airDraftById(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    const draft = await this.airOrderService.getDraft(tenant.tenantId, id);
    if (!draft) throw new NotFoundException("Pedido no encontrado");
    return draft;
  }

  @Get("providers/AIR/account")
  async airAccount(
    @CurrentTenant() tenant: TenantContext,
    @Query("refresh") refresh?: string
  ) {
    const key = `${tenant.tenantId}:AIR:account`;
    return this.accountCache.wrap(key, wantsRefresh(refresh), async () =>
      this.airAccountService.getAccount(tenant.tenantId, await this.credentialsOf(tenant, "AIR"))
    );
  }

  @Get("providers/AIR/documents")
  async airDocument(@CurrentTenant() tenant: TenantContext, @Query("href") href: string) {
    return this.airAccountService.getDocument(await this.credentialsOf(tenant, "AIR"), href);
  }

  @Post("providers/AIR/checkout/preview")
  async airPreview(@CurrentTenant() tenant: TenantContext, @Body() dto: AirCheckoutPreviewDto) {
    return this.airOrderService.preview(await this.credentialsOf(tenant, "AIR"), {
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
  async airDraft(
    @CurrentUser() user: { userId: string },
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: AirCheckoutDraftDto
  ) {
    const held = await this.hold(tenant, user.userId, "AIR", dto);
    if (held) return held;
    return this.airOrderService.submitDraft(this.author(user, tenant), await this.credentialsOf(tenant, "AIR"), dto);
  }

  @Get("providers/ELIT/drafts")
  elitDrafts(@CurrentTenant() tenant: TenantContext) {
    return this.elitOrderService.listDrafts(tenant.tenantId);
  }

  @Get("providers/ELIT/drafts/:id")
  async elitDraftById(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    const draft = await this.elitOrderService.getDraft(tenant.tenantId, id);
    if (!draft) throw new NotFoundException("Pedido no encontrado");
    return draft;
  }

  @Get("providers/ELIT/account")
  async elitAccount(
    @CurrentTenant() tenant: TenantContext,
    @Query("refresh") refresh?: string
  ) {
    const key = `${tenant.tenantId}:ELIT:account`;
    return this.accountCache.wrap(key, wantsRefresh(refresh), async () =>
      this.elitAccountService.getAccount(tenant.tenantId, await this.credentialsOf(tenant, "ELIT"))
    );
  }

  @Get("providers/ELIT/salenotes/:number")
  async elitSaleNote(@CurrentTenant() tenant: TenantContext, @Param("number") number: string) {
    return this.elitAccountService.getSaleNote(await this.credentialsOf(tenant, "ELIT"), number);
  }

  @Get("providers/ELIT/documents")
  async elitDocument(
    @CurrentTenant() tenant: TenantContext,
    @Query("form") form: string,
    @Query("number") number: string,
    @Query("kind") kind?: string
  ) {
    return this.elitAccountService.getDocument(await this.credentialsOf(tenant, "ELIT"), { form, number, kind });
  }

  @Get("providers/ELIT/payments")
  async elitPayments(@CurrentTenant() tenant: TenantContext) {
    return this.elitAccountService.getPayments(await this.credentialsOf(tenant, "ELIT"));
  }

  /** Bancos y tipos de operación. No usar GET /account/payments?include=options (crea un informe vacío). */
  @Get("providers/ELIT/payments/options")
  async elitPaymentOptions(@CurrentTenant() tenant: TenantContext) {
    return this.elitAccountService.getPaymentOptions(await this.credentialsOf(tenant, "ELIT"));
  }

  @Post("providers/ELIT/payments/operation")
  async elitPaymentOperation(@CurrentTenant() tenant: TenantContext, @Body() dto: ElitPaymentOperationDto) {
    return this.elitAccountService.createPaymentOperation(await this.credentialsOf(tenant, "ELIT"), dto);
  }

  @Post("providers/ELIT/payments/operation/:id/attach")
  async elitPaymentAttach(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Req() req: FastifyRequest
  ) {
    const file = await req.file();
    if (!file) throw new BadRequestException("No se recibió ningún archivo");
    const buffer = await file.toBuffer();
    return this.elitAccountService.attachPaymentOperation(
      await this.credentialsOf(tenant, "ELIT"),
      id,
      { filename: file.filename, mimetype: file.mimetype, buffer }
    );
  }

  @Post("providers/ELIT/payments/finish")
  async elitPaymentFinish(@CurrentTenant() tenant: TenantContext) {
    return this.elitAccountService.finishPayment(await this.credentialsOf(tenant, "ELIT"));
  }

  @Post("providers/ELIT/checkout/preview")
  async elitPreview(@CurrentTenant() tenant: TenantContext, @Body() dto: ElitCheckoutPreviewDto) {
    return this.elitOrderService.preview(await this.credentialsOf(tenant, "ELIT"), dto);
  }

  @Post("providers/ELIT/checkout/draft")
  async elitDraft(
    @CurrentUser() user: { userId: string },
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: ElitCheckoutDraftDto
  ) {
    const held = await this.hold(tenant, user.userId, "ELIT", dto);
    if (held) return held;
    return this.elitOrderService.submitDraft(this.author(user, tenant), await this.credentialsOf(tenant, "ELIT"), dto);
  }

  @Post("providers/:provider/sync")
  sync(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string) {
    return this.providersService.sync(commercialId(tenant), assertProvider(provider));
  }

  /**
   * Alternativa a la sync por API cuando el proveedor limita muy fuerte
   * (ej. AIR a 1 req/5min): el usuario exporta el catálogo a Excel/CSV
   * desde el propio portal del proveedor y lo sube acá. Mismo pipeline de
   * guardado (markup, stock mínimo, historial de precio) que un sync real.
   */
  @Post("providers/:provider/import")
  async importFile(
    @CurrentTenant() tenant: TenantContext,
    @Param("provider") provider: string,
    @Req() req: FastifyRequest
  ) {
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

    const result = await this.providersService.importFromRows(commercialId(tenant), prov, items);
    return { ...result, rowsInFile: rows.length, rowsSkipped: skipped, unmappedColumns };
  }

  @Get("providers/:provider/status")
  status(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string) {
    return this.providersService.status(commercialId(tenant), assertProvider(provider));
  }

  @Get("providers/:provider/config")
  getConfig(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string) {
    return this.providersService.getConfig(commercialId(tenant), assertProvider(provider));
  }

  @Put("providers/:provider/config")
  updateConfig(
    @CurrentTenant() tenant: TenantContext,
    @Param("provider") provider: string,
    @Body() dto: UpdateProviderConfigDto
  ) {
    return this.providersService.updateConfig(commercialId(tenant), assertProvider(provider), dto);
  }

  // Estos dos ya no tocan el catálogo de nadie más: borran las ofertas de esta
  // organización y dejan intacta la ficha, que es de toda la plataforma. Aun así
  // vacían el catálogo del comercio entero, así que son del dueño.

  @Post("providers/:provider/clear-zero-stock")
  clearZeroStock(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_PURGE_CATALOG);
    return this.providersService.clearZeroStock(commercialId(tenant), assertProvider(provider));
  }

  @Delete("providers/:provider/products")
  deleteAllProducts(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_PURGE_CATALOG);
    return this.providersService.deleteAllProducts(commercialId(tenant), assertProvider(provider));
  }

  // El catálogo se lee de la organización comercial (espejo si hay). Sin
  // membresía no hay nada que mostrar (vacío, no error). El superadmin de
  // prueba ve el catálogo del Comercio de Pruebas; el carrito es el suyo.

  @Get("search/provider/:provider")
  search(
    @CurrentTenantOrNone() tenant: TenantContext | null,
    @Param("provider") provider: string,
    @Query("name") name = "",
    @Query("brand") brand = "",
    @Query("includeOutOfStock") includeOutOfStock?: string
  ) {
    if (!tenant) return [];
    return this.providersService.search(commercialId(tenant), assertProvider(provider), name, {
      includeOutOfStock: parseIncludeOutOfStock(includeOutOfStock),
      brand: brand.trim() || undefined,
    });
  }

  @Get("providers/:provider/products/:externalId")
  async getProduct(
    @CurrentTenant() tenant: TenantContext,
    @Param("provider") provider: string,
    @Param("externalId") externalId: string
  ) {
    const product = await this.providersService.getProduct(
      commercialId(tenant),
      assertProvider(provider),
      externalId
    );
    if (!product) throw new NotFoundException("Producto no encontrado");
    return product;
  }

  @Get("providers/:provider/products/:externalId/price-history")
  getPriceHistory(
    @CurrentTenantOrNone() tenant: TenantContext | null,
    @Param("provider") provider: string,
    @Param("externalId") externalId: string
  ) {
    if (!tenant) return [];
    return this.providersService.getPriceHistory(commercialId(tenant), assertProvider(provider), externalId);
  }

  @Get("catalog/categories")
  getCategories(@CurrentTenantOrNone() tenant: TenantContext | null) {
    if (!tenant) return [];
    return this.providersService.getCategories(commercialId(tenant));
  }

  @Get("catalog/featured")
  getFeatured(@CurrentTenantOrNone() tenant: TenantContext | null, @Query("take") take?: string) {
    if (!tenant) return [];
    return this.providersService.getFeatured(commercialId(tenant), take ? Number(take) : 24);
  }

  @Get("catalog/by-category")
  getByCategory(
    @CurrentTenantOrNone() tenant: TenantContext | null,
    @Query("category") category: string,
    @Query("take") take?: string,
    @Query("includeOutOfStock") includeOutOfStock?: string
  ) {
    if (!category) throw new BadRequestException("Falta el parámetro category");
    if (!tenant) return [];
    return this.providersService.getByCategory(
      commercialId(tenant),
      category,
      take ? Number(take) : 60,
      { includeOutOfStock: parseIncludeOutOfStock(includeOutOfStock) }
    );
  }
}
