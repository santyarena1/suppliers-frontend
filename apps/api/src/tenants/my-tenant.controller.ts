import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { JwtPayload } from "@nodo/shared";
import { TENANT_ROLES_CAN_MANAGE_COMMERCE } from "@nodo/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import {
  InviteTeamMemberDto,
  RedeemAccessCodeDto,
  UpdateBuyerCanConfirmDto,
  UpdateCommerceDto,
  UpdateMembershipDto,
} from "./dto/tenant.dto";
import type { TenantContext } from "./tenant-context.service";
import { assertTenantRole } from "./tenant-roles";
import { TenantVisibilityService } from "./tenant-visibility.service";
import { TenantGuard } from "./tenant.guard";
import { TenantsService } from "./tenants.service";

/** Lo que una organización puede saber y hacer sobre sí misma, sin ser superadmin. */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my")
export class MyTenantController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly visibility: TenantVisibilityService
  ) {}

  /** Los proveedores que existen para esta organización. Para el resto, no existen. */
  @Get("providers")
  providers(@CurrentTenant() tenant: TenantContext) {
    return this.visibility.listFor(tenant.tenantId);
  }

  @Get("commerce")
  commerce(@CurrentTenant() tenant: TenantContext) {
    return this.tenants.ownProfile(tenant);
  }

  @Put("commerce")
  updateCommerce(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateCommerceDto) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    return this.tenants.updateOwnProfile(tenant, dto);
  }

  @Put("commerce/orders")
  setBuyerCanConfirm(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateBuyerCanConfirmDto) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    return this.tenants.setBuyerCanConfirm(tenant, dto.buyerCanConfirm);
  }

  @Get("team")
  team(@CurrentTenant() tenant: TenantContext) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    return this.tenants.listTeam(tenant);
  }

  @Post("team")
  invite(@CurrentTenant() tenant: TenantContext, @Body() dto: InviteTeamMemberDto) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    return this.tenants.inviteTeamMember(tenant, dto);
  }

  @Put("team/:membershipId")
  updateMember(
    @CurrentTenant() tenant: TenantContext,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMembershipDto
  ) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    return this.tenants.updateOwnMember(tenant, membershipId, dto);
  }

  @Post("redeem-code")
  redeemCode(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RedeemAccessCodeDto
  ) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    return this.tenants.redeemAccessCode(tenant, user.userId, dto.code);
  }
}
