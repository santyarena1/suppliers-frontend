import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { CreateOfflineOrdersDto, UpdateOfflineOrderDto } from "./dto/offline-order.dto";
import { RejectOrderDto } from "./dto/reject-order.dto";
import { OrderApprovalService } from "./order-approval.service";
import { OrdersService } from "./orders.service";

/** Pedidos de la organización, con la aprobación interna del comercio. */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly approval: OrderApprovalService
  ) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.orders.list(tenant);
  }

  @Get("pending-approval")
  async pending(@CurrentTenant() tenant: TenantContext) {
    return {
      canApprove: this.approval.canApprove(tenant),
      needsApproval: this.approval.needsApproval(tenant),
      orders: await this.orders.pending(tenant),
    };
  }

  /** Compras del comercio de la sesión. Nunca cruza con otro local. */
  @Get("insights")
  insights(@CurrentTenant() tenant: TenantContext, @Query("days") days?: string) {
    return this.orders.insights(tenant, days);
  }

  @Post("offline")
  createOffline(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateOfflineOrdersDto
  ) {
    return this.orders.createOffline(tenant, user.userId, dto);
  }

  @Patch(":id")
  updateOffline(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body() dto: UpdateOfflineOrderDto
  ) {
    return this.orders.updateOffline(tenant, id, dto);
  }

  @Post(":id/approve")
  approve(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Param("id") id: string
  ) {
    return this.orders.approve(tenant, user.userId, id);
  }

  @Post(":id/reject")
  reject(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { userId: string },
    @Param("id") id: string,
    @Body() dto: RejectOrderDto
  ) {
    return this.orders.reject(tenant, user.userId, id, dto.reason);
  }
}
