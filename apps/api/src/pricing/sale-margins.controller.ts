import { BadRequestException, Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { isProviderKey } from "@nodo/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { RequiresCapability } from "../tenants/entitlements";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { assertPermission } from "../tenants/tenant-roles";
import { TenantGuard } from "../tenants/tenant.guard";
import { CostSensitive } from "./cost-visibility";
import {
  SetCategoryMarginsDto,
  SetMarginByCategoryDto,
  SetProductMarginsDto,
  SetProviderMarginsDto,
  SetStoreMarginDto,
} from "./dto/sale-margins.dto";
import { SaleMarginsService } from "./sale-margins.service";

function assertProvider(value: string): string {
  const key = (value ?? "").toUpperCase();
  if (!isProviderKey(key)) throw new BadRequestException(`Proveedor inválido: ${value}`);
  return key;
}

/**
 * Márgenes de venta (modo vendedor, docs/PLAN_MODO_VENDEDOR.md §4).
 * Leer exige ver costos (la pantalla muestra costo → venta); escribir, el
 * permiso «Márgenes de venta».
 */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@RequiresCapability("sellerMode")
@CostSensitive()
@Controller()
export class SaleMarginsController {
  constructor(private readonly margins: SaleMarginsService) {}

  @Get("my/sale-margins/settings")
  settings(@CurrentTenant() tenant: TenantContext) {
    return this.margins.storeSettings(commercialId(tenant));
  }

  @Put("my/sale-margins/settings")
  setSettings(@CurrentTenant() tenant: TenantContext, @Body() dto: SetStoreMarginDto) {
    assertPermission(tenant, "pricing.manage");
    return this.margins.setStore(this.writer(tenant), dto.storePercent ?? null);
  }

  @Get("my/sale-margins/history")
  history(
    @CurrentTenant() tenant: TenantContext,
    @Query("provider") provider?: string,
    @Query("limit") limit?: string
  ) {
    return this.margins.history(commercialId(tenant), {
      provider: provider ? assertProvider(provider) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("providers/:provider/sale-margins")
  provider(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string) {
    return this.margins.providerMargins(commercialId(tenant), assertProvider(provider));
  }

  @Put("providers/:provider/sale-margins")
  setProvider(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string, @Body() dto: SetProviderMarginsDto) {
    assertPermission(tenant, "pricing.manage");
    return this.margins.setProvider(this.writer(tenant), assertProvider(provider), {
      base: dto.base,
      ...(dto.providerPercent !== undefined ? { providerPercent: dto.providerPercent } : {}),
    });
  }

  @Put("providers/:provider/sale-margins/categories")
  setCategories(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string, @Body() dto: SetCategoryMarginsDto) {
    assertPermission(tenant, "pricing.manage");
    return this.margins.setCategories(this.writer(tenant), assertProvider(provider), dto.keys, dto.percent ?? null);
  }

  @Get("providers/:provider/sale-margins/products")
  products(
    @CurrentTenant() tenant: TenantContext,
    @Param("provider") provider: string,
    @Query("category") category?: string,
    @Query("q") q?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
  ) {
    return this.margins.products(commercialId(tenant), assertProvider(provider), {
      category: category || undefined,
      q: q || undefined,
      cursor: cursor || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Put("providers/:provider/sale-margins/products")
  setProducts(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string, @Body() dto: SetProductMarginsDto) {
    assertPermission(tenant, "pricing.manage");
    return this.margins.setProducts(this.writer(tenant), assertProvider(provider), dto.externalIds, dto.percent ?? null);
  }

  /** Atajo: el mismo margen para toda una categoría es la regla de esa categoría. */
  @Put("providers/:provider/sale-margins/products/by-category")
  setByCategory(@CurrentTenant() tenant: TenantContext, @Param("provider") provider: string, @Body() dto: SetMarginByCategoryDto) {
    assertPermission(tenant, "pricing.manage");
    return this.margins.setCategories(this.writer(tenant), assertProvider(provider), [dto.category], dto.percent ?? null);
  }

  private writer(tenant: TenantContext) {
    return { tenantId: commercialId(tenant), userId: tenant.userId };
  }
}
