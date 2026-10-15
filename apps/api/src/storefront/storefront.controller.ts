import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { FastifyRequest } from "fastify";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { RequiresCapability } from "../tenants/entitlements";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import {
  AddStorefrontProductDto,
  AdminStorefrontStatusDto,
  CloseStorefrontDto,
  CreateUpgradeRequestDto,
  LinkSheetDto,
  OpenStorefrontDto,
  ProductsQueryDto,
  RespondStorefrontOrderDto,
  StorefrontItemQueryDto,
  StorefrontOfferDecisionDto,
  StorefrontOrdersQueryDto,
  UpdateStorefrontDto,
  UpdateStorefrontProductDto,
} from "./dto/storefront.dto";
import { StorefrontAudienceService } from "./storefront-audience.service";
import { StorefrontService } from "./storefront.service";
import { UpgradeRequestsService } from "./upgrade-requests.service";

/** Código de producto de la URL: sin caracteres de control (Postgres no los guarda) ni largos absurdos. */
function externalIdParam(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (!value || value.length > 200 || /[\u0000-\u001f]/.test(value)) throw new BadRequestException("Código de producto inválido");
  return value;
}

/** Vender en NODO, del lado del comercio (docs/PLAN_VENDER_EN_NODO.md). */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my")
export class StorefrontController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly audience: StorefrontAudienceService,
    private readonly upgrades: UpgradeRequestsService
  ) {}

  /** Sin capacidad también responde: la pantalla muestra qué es y el upgrade. */
  @Get("storefront")
  mine(@CurrentTenant() tenant: TenantContext) {
    return this.storefront.getMine(tenant);
  }

  @RequiresCapability("storefront")
  @Post("storefront")
  open(@CurrentTenant() tenant: TenantContext, @Body() dto: OpenStorefrontDto) {
    return this.storefront.open(tenant, dto);
  }

  @RequiresCapability("storefront")
  @Put("storefront")
  update(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateStorefrontDto) {
    return this.storefront.update(tenant, dto);
  }

  @RequiresCapability("storefront")
  @Post("storefront/confirm-stock")
  confirmStock(@CurrentTenant() tenant: TenantContext) {
    return this.storefront.confirmStock(tenant);
  }

  /** Cierra la tienda. Se reabre con POST /my/storefront. */
  @RequiresCapability("storefront")
  @Post("storefront/close")
  close(@CurrentTenant() tenant: TenantContext, @Body() dto: CloseStorefrontDto) {
    return this.storefront.close(tenant, dto);
  }

  /** Link de invitación nuevo; el anterior deja de servir. */
  @RequiresCapability("storefront")
  @Post("storefront/invite-link")
  regenerateInvite(@CurrentTenant() tenant: TenantContext) {
    return this.storefront.regenerateInvite(tenant);
  }

  @RequiresCapability("storefront")
  @Get("storefront/audience")
  audienceList(@CurrentTenant() tenant: TenantContext) {
    return this.storefront.audienceList(tenant);
  }

  @RequiresCapability("storefront")
  @Delete("storefront/audience/:tenantId")
  removeBuyer(@CurrentTenant() tenant: TenantContext, @Param("tenantId", new ParseUUIDPipe()) buyerTenantId: string) {
    return this.storefront.removeBuyer(tenant, buyerTenantId);
  }

  /** Conecta su Google Sheets (compartido como lector): NODO lo lee cada 15 minutos. */
  @RequiresCapability("storefront")
  @Put("storefront/sheet")
  linkSheet(@CurrentTenant() tenant: TenantContext, @Body() dto: LinkSheetDto) {
    return this.storefront.linkSheet(tenant, dto.url);
  }

  @RequiresCapability("storefront")
  @Delete("storefront/sheet")
  unlinkSheet(@CurrentTenant() tenant: TenantContext) {
    return this.storefront.unlinkSheet(tenant);
  }

  @RequiresCapability("storefront")
  @Post("storefront/sheet/sync")
  syncSheet(@CurrentTenant() tenant: TenantContext) {
    return this.storefront.syncSheet(tenant);
  }

  /** Foto de un producto o logo, ya achicada por el navegador. Devuelve `/assets/<id>`. */
  @RequiresCapability("storefront")
  @Post("storefront/images")
  async uploadImage(@CurrentTenant() tenant: TenantContext, @Req() req: FastifyRequest) {
    const file = await req.file();
    if (!file) throw new BadRequestException("No se recibió ninguna foto");
    const buffer = await file.toBuffer();
    return this.storefront.uploadImage(tenant, { filename: file.filename, buffer });
  }

  @RequiresCapability("storefront")
  @Get("storefront/products")
  products(@CurrentTenant() tenant: TenantContext, @Query() query: ProductsQueryDto) {
    return this.storefront.products(tenant, query.q);
  }

  @RequiresCapability("storefront")
  @Post("storefront/products")
  addProduct(@CurrentTenant() tenant: TenantContext, @Body() dto: AddStorefrontProductDto) {
    return this.storefront.addProduct(tenant, dto);
  }

  @RequiresCapability("storefront")
  @Put("storefront/products/:externalId")
  updateProduct(
    @CurrentTenant() tenant: TenantContext,
    @Param("externalId") externalId: string,
    @Body() dto: UpdateStorefrontProductDto
  ) {
    return this.storefront.updateProduct(tenant, externalIdParam(externalId), dto);
  }

  @RequiresCapability("storefront")
  @Delete("storefront/products/:externalId")
  removeProduct(@CurrentTenant() tenant: TenantContext, @Param("externalId") externalId: string) {
    return this.storefront.removeProduct(tenant, externalIdParam(externalId));
  }

  @RequiresCapability("storefront")
  @Get("storefront/orders")
  orders(@CurrentTenant() tenant: TenantContext, @Query() query: StorefrontOrdersQueryDto) {
    return this.storefront.orders(tenant, query.status);
  }

  @RequiresCapability("storefront")
  @Post("storefront/orders/:id/respond")
  respond(
    @CurrentTenant() tenant: TenantContext,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: RespondStorefrontOrderDto
  ) {
    return this.storefront.respond(tenant, id, dto.action, dto.note);
  }

  /** El comprador cancela un pedido a una tienda mientras no le respondieron. */
  @Post("storefront-purchases/:id/cancel")
  cancelPurchase(@CurrentTenant() tenant: TenantContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.storefront.cancelPurchase(tenant, id);
  }

  // ---------- Del lado del comprador ----------

  /** Tiendas de locales que se le ofrecieron a este comercio y qué eligió. */
  @Get("storefront-offers")
  offers(@CurrentTenant() tenant: TenantContext) {
    return this.audience.offers(tenant);
  }

  @Post("storefront-offers/:id")
  decide(
    @CurrentTenant() tenant: TenantContext,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: StorefrontOfferDecisionDto
  ) {
    return this.audience.decide(tenant, id, dto.decision);
  }

  @Get("storefront-invites/:token")
  invitePreview(@CurrentTenant() tenant: TenantContext, @Param("token") token: string) {
    return this.audience.invitePreview(tenant, token);
  }

  @Post("storefront-invites/:token/accept")
  acceptInvite(@CurrentTenant() tenant: TenantContext, @Param("token") token: string) {
    return this.audience.acceptInvite(tenant, token);
  }

  /** Condiciones de la tienda, fotos y estado de un producto, para la ficha. */
  @Get("storefront-item")
  itemInfo(@CurrentTenant() tenant: TenantContext, @Query() query: StorefrontItemQueryDto) {
    return this.audience.itemInfo(tenant, query.provider, externalIdParam(query.externalId));
  }

  @Get("upgrade-requests")
  myUpgradeRequests(@CurrentTenant() tenant: TenantContext) {
    return this.upgrades.mine(tenant);
  }

  @Post("upgrade-requests")
  createUpgradeRequest(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateUpgradeRequestDto) {
    return this.upgrades.create(tenant, dto);
  }
}

/** Moderación de tiendas, para el superadmin. Las solicitudes van a la bandeja de Solicitudes. */
@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin")
export class StorefrontAdminController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get("storefronts")
  list() {
    return this.storefront.adminList();
  }

  @Put("storefronts/:id/status")
  setStatus(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: AdminStorefrontStatusDto) {
    return this.storefront.adminSetStatus(id, dto.status, dto.reason);
  }
}
