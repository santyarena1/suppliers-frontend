import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { CartService } from "./cart.service";
import { AddCartItemDto } from "./dto/add-item.dto";
import { UpdateCartItemDto } from "./dto/update-item.dto";

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.cartService.list(tenant);
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
  clear(
    @CurrentTenant() tenant: TenantContext,
    @Query("provider") provider?: string
  ) {
    return this.cartService.clear(tenant, provider);
  }
}
