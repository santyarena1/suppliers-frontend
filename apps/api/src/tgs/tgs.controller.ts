import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type {
  TgsCliente,
  TgsCompra,
  TgsCuentaCorriente,
  TgsKeysStatus,
  TgsMe,
  TgsOrden,
  TgsRma,
  TgsStockItem,
  TgsVenta,
} from "@nodo/shared";
import { CurrentTenant, CurrentTenantOrNone } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
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
  TgsSaveKeysDto,
  TgsStockQueryDto,
  TgsVentasQueryDto,
} from "./tgs.dto";
import { TgsKeysService } from "./tgs.keys";
import { TgsService } from "./tgs.service";
import { assertJsonObject } from "./tgs.write";

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("tgs")
export class TgsController {
  constructor(
    private readonly tgs: TgsService,
    private readonly access: TgsAccessService,
    private readonly keys: TgsKeysService
  ) {}

  /** Para el sidebar: 200 siempre, sin pegarle a AcuStock. */
  @Get("enabled")
  async enabled(@CurrentTenantOrNone() tenant: TenantContext | null) {
    return { enabled: await this.access.isAllowed(tenant) };
  }

  @Get("keys")
  async keysStatus(@CurrentTenant() tenant: TenantContext): Promise<TgsKeysStatus> {
    await this.access.assertAllowed(tenant);
    return this.keys.status();
  }

  @Put("keys")
  async saveKeys(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Body() dto: TgsSaveKeysDto
  ): Promise<TgsKeysStatus> {
    await this.access.assertAllowed(tenant);
    const status = await this.keys.save(tenant.tenantId, user.userId, dto);
    return this.withVerify(status);
  }

  @Delete("keys")
  async clearKeys(@CurrentTenant() tenant: TenantContext): Promise<TgsKeysStatus> {
    await this.access.assertAllowed(tenant);
    return this.keys.clear(tenant.tenantId);
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

  @Post("clientes")
  createCliente(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.write<TgsCliente>(tenant, "post", "/clientes", body);
  }

  @Patch("clientes/:id")
  patchCliente(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() body: unknown) {
    return this.write<TgsCliente>(tenant, "patch", `/clientes/${encodeURIComponent(id)}`, body);
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

  @Post("stock")
  createStock(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.write<TgsStockItem>(tenant, "post", "/stock", body);
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

  @Post("ventas")
  createVenta(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.write<TgsVenta>(tenant, "post", "/ventas", body);
  }

  @Patch("ventas/:id")
  patchVenta(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() body: unknown) {
    return this.write<TgsVenta>(tenant, "patch", `/ventas/${encodeURIComponent(id)}`, body);
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

  @Post("compras")
  createCompra(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.write<TgsCompra>(tenant, "post", "/compras", body);
  }

  @Patch("compras/:id")
  patchCompra(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() body: unknown) {
    return this.write<TgsCompra>(tenant, "patch", `/compras/${encodeURIComponent(id)}`, body);
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

  @Post("ctacte/clientes/:id")
  postCtaCliente(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() body: unknown) {
    return this.write<TgsCuentaCorriente>(tenant, "post", `/ctacte/clientes/${encodeURIComponent(id)}`, body);
  }

  @Post("ctacte/proveedores/:id")
  postCtaProveedor(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() body: unknown) {
    return this.write<TgsCuentaCorriente>(tenant, "post", `/ctacte/proveedores/${encodeURIComponent(id)}`, body);
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

  @Post("ordenes")
  createOrden(@CurrentTenant() tenant: TenantContext, @Body() body: unknown) {
    return this.write<TgsOrden>(tenant, "post", "/ordenes", body);
  }

  @Patch("ordenes/:id")
  patchOrden(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() body: unknown) {
    return this.write<TgsOrden>(tenant, "patch", `/ordenes/${encodeURIComponent(id)}`, body);
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

  @Patch("rma/:id")
  patchRma(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() body: unknown) {
    return this.write<TgsRma>(tenant, "patch", `/rma/${encodeURIComponent(id)}`, body);
  }

  private async write<T>(
    tenant: TenantContext,
    method: "post" | "patch" | "put",
    path: string,
    body: unknown
  ): Promise<T> {
    await this.access.assertAllowed(tenant);
    const payload = assertJsonObject(body);
    if (method === "post") return this.tgs.post<T>(path, payload);
    if (method === "put") return this.tgs.put<T>(path, payload);
    return this.tgs.patch<T>(path, payload);
  }

  private async withVerify(status: TgsKeysStatus): Promise<TgsKeysStatus> {
    try {
      const me = await this.tgs.detail<TgsMe>("/me");
      return { ...status, verified: true, verifyError: null, tenant: me.tenant, key_name: me.key_name };
    } catch (err) {
      return { ...status, verified: false, verifyError: exceptionMessage(err) };
    }
  }
}

function exceptionMessage(err: unknown): string {
  if (err instanceof HttpException) {
    const res = err.getResponse();
    if (typeof res === "string") return res;
    if (res && typeof res === "object" && "message" in res) {
      const message = (res as { message: unknown }).message;
      if (typeof message === "string") return message;
      if (Array.isArray(message)) return message.map(String).join(", ");
    }
    return err.message;
  }
  return "AcuStock no respondió";
}
