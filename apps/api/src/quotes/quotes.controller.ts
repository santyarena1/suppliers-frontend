import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { FastifyRequest } from "fastify";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { RequiresCapability } from "../tenants/entitlements";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import {
  AddCustomItemDto,
  AddQuoteItemDto,
  MoveQuoteItemDto,
  QuoteClientDto,
  QuoteSettingsDto,
  UpdateQuoteItemDto,
} from "./dto/quotes.dto";
import { QuoteSettingsService } from "./quote-settings.service";
import { QuotesService, seesAllQuotes } from "./quotes.service";

/**
 * Presupuestos de venta (modo vendedor, docs/PLAN_MODO_VENDEDOR.md §8).
 * Son la herramienta del vendedor: solo precios de venta, nunca costo, así
 * que NO van marcados como sensibles a costos (el margen propio de un
 * presupuesto solo lo ve y lo cambia quien ve costos). Cada uno ve los suyos;
 * dueño y admin, los de todo el equipo.
 */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@RequiresCapability("sellerMode")
@Controller("my/quotes")
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query("archived") archived?: string,
    @Query("q") q?: string,
    @Query("createdById") createdById?: string,
    @Query("status") status?: string
  ) {
    return this.quotes.list(tenant, { archived: archived === "true" || archived === "1", q, createdById, status });
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: QuoteClientDto) {
    return this.quotes.create(tenant, dto);
  }

  @Get(":id")
  get(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.quotes.get(tenant, id);
  }

  @Patch(":id")
  update(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: QuoteClientDto) {
    return this.quotes.updateClient(tenant, id, dto);
  }

  @Delete(":id")
  remove(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.quotes.remove(tenant, id);
  }

  @Post(":id/duplicate")
  duplicate(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.quotes.duplicate(tenant, id);
  }

  @Post(":id/sent")
  sent(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.quotes.markSent(tenant, id);
  }

  @Post(":id/items")
  addItem(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: AddQuoteItemDto) {
    return this.quotes.addItem(tenant, id, dto);
  }

  @Post(":id/items/custom")
  addCustom(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: AddCustomItemDto) {
    return this.quotes.addCustom(tenant, id, dto);
  }

  @Patch(":id/items/:index")
  updateItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Param("index", ParseIntPipe) index: number,
    @Body() dto: UpdateQuoteItemDto
  ) {
    return this.quotes.updateItem(tenant, id, index, dto);
  }

  @Post(":id/items/:index/move")
  moveItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Param("index", ParseIntPipe) index: number,
    @Body() dto: MoveQuoteItemDto
  ) {
    return this.quotes.moveItem(tenant, id, index, dto.to);
  }

  @Delete(":id/items/:index")
  removeItem(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Param("index", ParseIntPipe) index: number) {
    return this.quotes.removeItem(tenant, id, index);
  }

  @Post(":id/refresh-prices")
  refresh(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.quotes.refreshPrices(tenant, id);
  }

  @Post(":id/archive")
  archive(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.quotes.setArchived(tenant, id, true);
  }

  @Post(":id/unarchive")
  unarchive(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.quotes.setArchived(tenant, id, false);
  }
}

/**
 * Plantilla de los presupuestos (cómo se ve el PDF y valores por defecto).
 * La lee todo el equipo para armar el PDF; la cambian dueño y admin.
 */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@RequiresCapability("sellerMode")
@Controller("my/quote-settings")
export class QuoteSettingsController {
  constructor(private readonly settings: QuoteSettingsService) {}

  @Get()
  get(@CurrentTenant() tenant: TenantContext) {
    return this.settings.get(tenant.tenantId);
  }

  @Put()
  update(@CurrentTenant() tenant: TenantContext, @Body() dto: QuoteSettingsDto) {
    assertManager(tenant);
    return this.settings.update(tenant.tenantId, tenant.userId, dto);
  }

  @Post("logo")
  async uploadLogo(@CurrentTenant() tenant: TenantContext, @Req() req: FastifyRequest) {
    assertManager(tenant);
    const file = await req.file();
    if (!file) throw new BadRequestException("No se recibió ninguna imagen");
    const buffer = await file.toBuffer();
    return this.settings.setLogo(tenant.tenantId, tenant.userId, { filename: file.filename, buffer });
  }

  @Delete("logo")
  removeLogo(@CurrentTenant() tenant: TenantContext) {
    assertManager(tenant);
    return this.settings.setLogo(tenant.tenantId, tenant.userId, null);
  }
}

function assertManager(tenant: TenantContext) {
  if (!seesAllQuotes(tenant)) {
    throw new ForbiddenException("La plantilla de presupuestos la cambian el dueño o un administrador.");
  }
}
