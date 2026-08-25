import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { CreateOfflineOrdersDto, UpdateOfflineOrderDto } from "./dto/offline-order.dto";
import { RenameOpsAliasDto, SplitOpsAliasDto, UnifyOpsAliasDto } from "./dto/ops-alias.dto";
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

  @Put("insights/aliases")
  unifyAlias(@CurrentTenant() tenant: TenantContext, @Body() dto: UnifyOpsAliasDto) {
    return this.orders.unifyOpsAlias(tenant, dto);
  }

  @Patch("insights/aliases/:groupId")
  renameAlias(
    @CurrentTenant() tenant: TenantContext,
    @Param("groupId") groupId: string,
    @Body() dto: RenameOpsAliasDto
  ) {
    return this.orders.renameOpsAlias(tenant, groupId, dto);
  }

  @Post("insights/aliases/:groupId/split")
  splitAlias(
    @CurrentTenant() tenant: TenantContext,
    @Param("groupId") groupId: string,
    @Body() dto: SplitOpsAliasDto
  ) {
    return this.orders.splitOpsAlias(tenant, groupId, dto);
  }

  @Delete("insights/aliases/:groupId")
  deleteAlias(@CurrentTenant() tenant: TenantContext, @Param("groupId") groupId: string) {
    return this.orders.deleteOpsAlias(tenant, groupId);
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
