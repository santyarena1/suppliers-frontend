import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { CartService } from "./cart.service";
import { AddCartItemDto } from "./dto/add-item.dto";
import { UpdateCartItemDto } from "./dto/update-item.dto";
import { CostSensitive } from "../pricing/cost-visibility";
import { UpsertOrgCartDto } from "./dto/org-cart.dto";

@UseGuards(AuthGuard("jwt"), TenantGuard)
// Modo vendedor: el carrito guarda y cotiza costos.
@CostSensitive()
@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /** Carrito compartido del local. */
  @Get("org")
  org(@CurrentTenant() tenant: TenantContext) {
    return this.cartService.getOrgCart(tenant);
  }

  /** Pedidos de las últimas horas, para avisar antes de pedir dos veces lo mismo. */
  @Get("org/recent-orders")
  recentOrders(@CurrentTenant() tenant: TenantContext, @Query("hours") hours?: string) {
    return this.cartService.recentOrders(tenant, Number(hours) || 6);
  }

  @Put("org")
  saveOrg(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Body() dto: UpsertOrgCartDto
  ) {
    return this.cartService.putOrgCart(tenant, user.userId, dto);
  }

  @Get("clients/:linkId")
  clientCart(@CurrentTenant() tenant: TenantContext, @Param("linkId") linkId: string) {
    return this.cartService.getClientCart(tenant, linkId);
  }

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: { userId: string }) {
    return this.cartService.list(tenant, user.userId);
  }

  @Post("items")
  addItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Body() dto: AddCartItemDto
  ) {
    return this.cartService.addItem(tenant, user.userId, dto);
  }

  @Patch("items/:id")
  updateItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
    @Body() dto: UpdateCartItemDto
  ) {
    return this.cartService.updateItem(tenant, user.userId, id, dto);
  }

  @Delete("items/:id")
  removeItem(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Param("id") id: string
  ) {
    return this.cartService.removeItem(tenant, user.userId, id);
  }

  @Delete()
  clear(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: { userId: string }) {
    return this.cartService.clear(tenant, user.userId);
  }
}
