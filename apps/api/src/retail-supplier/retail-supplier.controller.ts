import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { CartLinkDto, SetDiscountsDto } from "./retail-supplier.dto";
import { RetailSupplierService } from "./retail-supplier.service";

/** Locales de venta como proveedores, y descuentos sobre proveedores por lista. */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my")
export class RetailSupplierController {
  constructor(private readonly service: RetailSupplierService) {}

  @Get("retail-suppliers")
  list(@CurrentTenant() tenant: TenantContext, @Query("q") q?: string) {
    return this.service.listStores(tenant, q);
  }

  @Post("retail-suppliers/:storeId")
  connect(@CurrentTenant() tenant: TenantContext, @Param("storeId", ParseUUIDPipe) storeId: string) {
    return this.service.connect(tenant, storeId);
  }

  @Delete("retail-suppliers/:storeId")
  disconnect(@CurrentTenant() tenant: TenantContext, @Param("storeId", ParseUUIDPipe) storeId: string) {
    return this.service.disconnect(tenant, storeId);
  }

  @Post("retail-suppliers/cart-link/:provider")
  cartLink(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string, @Body() dto: CartLinkDto) {
    return this.service.cartLink(tenant, provider, dto.items);
  }

  @Get("list-discounts/:provider")
  discounts(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string) {
    return this.service.getDiscounts(tenant, provider);
  }

  @Put("list-discounts/:provider")
  setDiscounts(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string, @Body() dto: SetDiscountsDto) {
    return this.service.setDiscounts(tenant, provider, dto.general ?? null, dto.rules);
  }
}
