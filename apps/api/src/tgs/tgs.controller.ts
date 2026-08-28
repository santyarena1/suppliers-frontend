import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type {
  TgsCliente,
  TgsCompra,
  TgsCuentaCorriente,
  TgsMe,
  TgsOrden,
  TgsRma,
  TgsStockItem,
  TgsVenta,
} from "@nodo/shared";
import { CurrentTenant, CurrentTenantOrNone } from "../common/decorators/current-tenant.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TgsAccessService } from "./tgs.access";
import {
  TgsClientesQueryDto,
  TgsComprasQueryDto,
  TgsCreateRmaDto,
  TgsCtaCteQueryDto,
  TgsOrdenesQueryDto,
  TgsPatchStockDto,
  TgsProductosVendidosQueryDto,
  TgsRmaQueryDto,
  TgsStockQueryDto,
  TgsVentasQueryDto,
} from "./tgs.dto";
import { TgsService } from "./tgs.service";

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("tgs")
export class TgsController {
  constructor(
    private readonly tgs: TgsService,
    private readonly access: TgsAccessService
  ) {}

  /** Para el sidebar: 200 siempre, sin pegarle a AcuStock. */
  @Get("enabled")
  async enabled(@CurrentTenantOrNone() tenant: TenantContext | null) {
    return { enabled: await this.access.isAllowed(tenant) };
  }

  @Get("me")
  async me(@CurrentTenant() tenant: TenantContext) {
    await this.access.assertAllowed(tenant);
    return this.tgs.detail<TgsMe>("/me");
  }

  @Get("clientes")
  async clientes(@CurrentTenant() tenant: TenantContext, @Query() query: TgsClientesQueryDto) {
    await this.access.assertAllowed(tenant);
    return this.tgs.list<TgsCliente>("/clientes", { ...query });
  }

  @Get("clientes/:id")
  async cliente(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    await this.access.assertAllowed(tenant);
    return this.tgs.detail<TgsCliente>(`/clientes/${encodeURIComponent(id)}`);
  }

  @Get("stock")
  async stock(@CurrentTenant() tenant: TenantContext, @Query() query: TgsStockQueryDto) {
    await this.access.assertAllowed(tenant);
    return this.tgs.list<TgsStockItem>("/stock", { ...query });
  }

  @Get("stock/:id")
  async stockOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    await this.access.assertAllowed(tenant);
    return this.tgs.detail<TgsStockItem>(`/stock/${encodeURIComponent(id)}`);
  }

  @Patch("stock/:id")
  async patchStock(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body() dto: TgsPatchStockDto
  ) {
    await this.access.assertAllowed(tenant);
    return this.tgs.patch<TgsStockItem>(`/stock/${encodeURIComponent(id)}`, dto);
  }

  @Get("ventas")
  async ventas(@CurrentTenant() tenant: TenantContext, @Query() query: TgsVentasQueryDto) {
    await this.access.assertAllowed(tenant);
    return this.tgs.list<TgsVenta>("/ventas", { ...query });
  }

  @Get("productos-vendidos")
  async productosVendidos(@CurrentTenant() tenant: TenantContext, @Query() query: TgsProductosVendidosQueryDto) {
    await this.access.assertAllowed(tenant);
    return this.tgs.productosVendidos({ ...query });
  }

  @Get("ventas/:id")
  async venta(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    await this.access.assertAllowed(tenant);
    return this.tgs.detail<TgsVenta>(`/ventas/${encodeURIComponent(id)}`);
  }

  @Get("compras")
  async compras(@CurrentTenant() tenant: TenantContext, @Query() query: TgsComprasQueryDto) {
    await this.access.assertAllowed(tenant);
    return this.tgs.list<TgsCompra>("/compras", { ...query });
  }

  @Get("compras/:id")
  async compra(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    await this.access.assertAllowed(tenant);
    return this.tgs.detail<TgsCompra>(`/compras/${encodeURIComponent(id)}`);
  }

  @Get("ctacte/clientes/:id")
  async ctacteCliente(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Query() query: TgsCtaCteQueryDto
  ) {
    await this.access.assertAllowed(tenant);
    return this.tgs.detailWithMeta<TgsCuentaCorriente>(`/ctacte/clientes/${encodeURIComponent(id)}`, { ...query });
  }

  @Get("ctacte/proveedores/:id")
  async ctacteProveedor(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Query() query: TgsCtaCteQueryDto
  ) {
    await this.access.assertAllowed(tenant);
    return this.tgs.detailWithMeta<TgsCuentaCorriente>(`/ctacte/proveedores/${encodeURIComponent(id)}`, { ...query });
  }

  @Get("ordenes")
  async ordenes(@CurrentTenant() tenant: TenantContext, @Query() query: TgsOrdenesQueryDto) {
    await this.access.assertAllowed(tenant);
    return this.tgs.list<TgsOrden>("/ordenes", { ...query });
  }

  @Get("ordenes/:id")
  async orden(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    await this.access.assertAllowed(tenant);
    return this.tgs.detail<TgsOrden>(`/ordenes/${encodeURIComponent(id)}`);
  }

  @Get("rma")
  async rma(@CurrentTenant() tenant: TenantContext, @Query() query: TgsRmaQueryDto) {
    await this.access.assertAllowed(tenant);
    return this.tgs.list<TgsRma>("/rma", { ...query });
  }

  @Get("rma/:id")
  async rmaOne(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    await this.access.assertAllowed(tenant);
    return this.tgs.detail<TgsRma>(`/rma/${encodeURIComponent(id)}`);
  }

  @Post("rma")
  async createRma(@CurrentTenant() tenant: TenantContext, @Body() dto: TgsCreateRmaDto) {
    await this.access.assertAllowed(tenant);
    return this.tgs.post<TgsRma>("/rma", dto);
  }
}
