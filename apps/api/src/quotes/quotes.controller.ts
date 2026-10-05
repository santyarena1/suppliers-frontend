import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { RequiresCapability } from "../tenants/entitlements";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { AddQuoteItemDto, QuoteClientDto, UpdateQuoteItemDto } from "./dto/quotes.dto";
import { QuotesService } from "./quotes.service";

/**
 * Presupuestos de venta (modo vendedor, docs/PLAN_MODO_VENDEDOR.md §8).
 * Son la herramienta del vendedor: solo precios de venta, nunca costo, así
 * que NO van marcados como sensibles a costos. Cada uno ve los suyos; dueño y
 * admin, los de todo el equipo.
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
    @Query("createdById") createdById?: string
  ) {
    return this.quotes.list(tenant, { archived: archived === "true" || archived === "1", q, createdById });
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

  @Post(":id/items")
  addItem(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: AddQuoteItemDto) {
    return this.quotes.addItem(tenant, id, dto);
  }

  @Patch(":id/items/:index")
  setItemQty(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Param("index", ParseIntPipe) index: number,
    @Body() dto: UpdateQuoteItemDto
  ) {
    return this.quotes.setItemQty(tenant, id, index, dto.qty);
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
