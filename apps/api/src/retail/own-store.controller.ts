import { Body, Controller, Get, Put, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { OwnStoreQuotesDto, SetOwnStoreDto } from "./dto/own-store.dto";
import { OwnStoreService } from "./own-store.service";

/** Tienda web del comercio. Solo organizaciones tipo 1 (RETAILER). */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my/own-store")
export class OwnStoreController {
  constructor(private readonly ownStore: OwnStoreService) {}

  @Get()
  get(@CurrentTenant() tenant: TenantContext) {
    return this.ownStore.get(tenant);
  }

  @Get("options")
  options(@CurrentTenant() tenant: TenantContext) {
    return this.ownStore.listOptions(tenant);
  }

  @Put()
  set(@CurrentTenant() tenant: TenantContext, @Body() dto: SetOwnStoreDto) {
    return this.ownStore.set(tenant, dto.retailStoreId);
  }

  @Post("quotes")
  quotes(@CurrentTenant() tenant: TenantContext, @Body() dto: OwnStoreQuotesDto) {
    return this.ownStore.quotes(tenant, dto.items);
  }
}
