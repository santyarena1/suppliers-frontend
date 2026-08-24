import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
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
      needsApproval: await this.approval.needsApproval(tenant),
      orders: await this.orders.pending(tenant),
    };
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
