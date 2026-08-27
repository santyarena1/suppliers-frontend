import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { JwtPayload } from "@nodo/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import {
  CreateAccessCodeDto,
  CreateOwnMemberDto,
  RedeemAccessCodeDto,
  SetProductManagerScopeDto,
  UpdateMembershipDto,
  UpdateOwnClientDto,
  UpdateOwnOrgDto,
} from "./dto/tenant.dto";
import { PortfolioService } from "./portfolio.service";
import { commercialId, type TenantContext } from "./tenant-context.service";
import { TenantVisibilityService } from "./tenant-visibility.service";
import { TenantGuard } from "./tenant.guard";
import { TenantsService } from "./tenants.service";

/** Lo que una organización puede saber y hacer sobre sí misma, sin ser superadmin. */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my")
export class MyTenantController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly visibility: TenantVisibilityService,
    private readonly portfolio: PortfolioService
  ) {}

  @Get("org")
  org(@CurrentTenant() tenant: TenantContext) {
    return this.tenants.getOwnOrg(tenant);
  }

  @Put("org")
  updateOrg(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateOwnOrgDto) {
    return this.tenants.updateOwnOrg(tenant, dto);
  }

  /** Los proveedores que existen para esta organización. Para el resto, no existen. */
  @Get("providers")
  providers(@CurrentTenant() tenant: TenantContext) {
    return this.visibility.listFor(commercialId(tenant));
  }

  @Post("redeem-code")
  redeemCode(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RedeemAccessCodeDto
  ) {
    return this.tenants.redeemAccessCode(tenant, user.userId, dto.code);
  }

  @Get("team")
  team(@CurrentTenant() tenant: TenantContext) {
    return this.tenants.listOwnTeam(tenant);
  }

  @Post("team")
  addMember(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateOwnMemberDto) {
    return this.tenants.createOwnMember(tenant, dto);
  }

  @Put("team/:membershipId")
  updateMember(
    @CurrentTenant() tenant: TenantContext,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMembershipDto
  ) {
    return this.tenants.updateOwnMember(tenant, membershipId, dto);
  }

  @Delete("team/:membershipId")
  removeMember(@CurrentTenant() tenant: TenantContext, @Param("membershipId") membershipId: string) {
    return this.tenants.removeOwnMember(tenant, membershipId);
  }

  @Post("team/:membershipId/password")
  resetPassword(@CurrentTenant() tenant: TenantContext, @Param("membershipId") membershipId: string) {
    return this.tenants.resetOwnMemberPassword(tenant, membershipId);
  }

  @Put("team/:membershipId/managed-brands")
  setManagedBrands(
    @CurrentTenant() tenant: TenantContext,
    @Param("membershipId") membershipId: string,
    @Body() dto: SetProductManagerScopeDto
  ) {
    return this.tenants.setOwnProductManagerScope(tenant, membershipId, dto);
  }

  @Get("access-codes")
  accessCodes(@CurrentTenant() tenant: TenantContext) {
    return this.tenants.listOwnAccessCodes(tenant);
  }

  @Post("access-codes")
  createAccessCode(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateAccessCodeDto) {
    return this.tenants.createOwnAccessCode(tenant, dto);
  }

  @Delete("access-codes/:codeId")
  revokeAccessCode(@CurrentTenant() tenant: TenantContext, @Param("codeId") codeId: string) {
    return this.tenants.revokeOwnAccessCode(tenant, codeId);
  }

  @Get("clients")
  clients(@CurrentTenant() tenant: TenantContext) {
    return this.portfolio.listClients(tenant);
  }

  @Get("clients/orders")
  clientOrders(
    @CurrentTenant() tenant: TenantContext,
    @Query("linkId") linkId?: string,
    @Query("scope") scope?: "brands" | "all"
  ) {
    return this.portfolio.listClientOrders(tenant, linkId, scope);
  }

  @Get("clients/:linkId")
  client(@CurrentTenant() tenant: TenantContext, @Param("linkId") linkId: string) {
    return this.portfolio.getClient(tenant, linkId);
  }

  @Put("clients/:linkId")
  updateClient(
    @CurrentTenant() tenant: TenantContext,
    @Param("linkId") linkId: string,
    @Body() dto: UpdateOwnClientDto
  ) {
    return this.portfolio.updateClient(tenant, linkId, dto);
  }
}
