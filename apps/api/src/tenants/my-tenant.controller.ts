import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { JwtPayload } from "@nodo/shared";
import { TENANT_ROLES_CAN_MANAGE_COMMERCE, TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR, TENANT_ROLES_CAN_MANAGE_BRAND_DISCOUNTS } from "@nodo/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ChatService } from "./chat.service";
import {
  CreateAccessCodeDto,
  InviteTeamMemberDto,
  PostLinkMessageDto,
  RedeemAccessCodeDto,
  SetProductManagerScopeDto,
  UpdateAdvertisingDto,
  UpdateBuyerCanConfirmDto,
  UpdateClientLinkDto,
  UpdateCommerceDto,
  UpdateMembershipDto,
  UpsertBrandDiscountDto,
} from "./dto/tenant.dto";
import { PortfolioService } from "./portfolio.service";
import type { TenantContext } from "./tenant-context.service";
import { assertTenantRole, assertTenantType } from "./tenant-roles";
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
    private readonly portfolio: PortfolioService,
    private readonly chat: ChatService
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

  @Put("advertising")
  setAdvertising(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateAdvertisingDto) {
    return this.portfolio.setAdvertising(tenant, dto.advertisingEnabled);
  }

  @Get("team")
  team(@CurrentTenant() tenant: TenantContext) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    return this.tenants.listTeam(tenant);
  }

  @Post("team")
  invite(@CurrentTenant() tenant: TenantContext, @Body() dto: InviteTeamMemberDto) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    this.portfolio.assertInvitableRole(tenant, dto.role);
    return this.tenants.inviteTeamMember(tenant, dto);
  }

  @Put("team/:membershipId")
  updateMember(
    @CurrentTenant() tenant: TenantContext,
    @Param("membershipId") membershipId: string,
    @Body() dto: UpdateMembershipDto
  ) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    if (dto.role) this.portfolio.assertInvitableRole(tenant, dto.role);
    return this.tenants.updateOwnMember(tenant, membershipId, dto);
  }

  @Put("team/:membershipId/brands")
  setMemberBrands(
    @CurrentTenant() tenant: TenantContext,
    @Param("membershipId") membershipId: string,
    @Body() dto: SetProductManagerScopeDto
  ) {
    assertTenantType(tenant, ["DISTRIBUTOR"]);
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR);
    return this.tenants.setOwnMemberBrands(tenant, membershipId, dto);
  }

  @Get("catalog-brands")
  catalogBrands(@CurrentTenant() tenant: TenantContext) {
    assertTenantType(tenant, ["DISTRIBUTOR"]);
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR);
    return this.tenants.catalogBrands(tenant);
  }

  @Get("managed-brands")
  managedBrands(@CurrentTenant() tenant: TenantContext) {
    assertTenantType(tenant, ["DISTRIBUTOR"]);
    return this.tenants.managedBrands(tenant);
  }

  @Get("brand-discounts")
  brandDiscounts(@CurrentTenant() tenant: TenantContext) {
    assertTenantType(tenant, ["DISTRIBUTOR"]);
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_BRAND_DISCOUNTS);
    return this.tenants.listBrandDiscounts(tenant);
  }

  @Put("brand-discounts")
  upsertBrandDiscount(@CurrentTenant() tenant: TenantContext, @Body() dto: UpsertBrandDiscountDto) {
    assertTenantType(tenant, ["DISTRIBUTOR"]);
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_BRAND_DISCOUNTS);
    return this.tenants.upsertBrandDiscount(tenant, dto);
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

  // ---------- Cartera del distribuidor ----------

  @Get("clients")
  clients(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.portfolio.listClients(tenant, user.userId);
  }

  @Get("client-orders")
  clientOrders(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.portfolio.listClientOrders(tenant, user.userId);
  }

  @Get("clients/:linkId")
  client(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("linkId") linkId: string
  ) {
    return this.portfolio.getClient(tenant, user.userId, linkId);
  }

  @Get("clients/:linkId/orders")
  clientLinkOrders(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("linkId") linkId: string
  ) {
    return this.portfolio.listClientOrders(tenant, user.userId, linkId);
  }

  @Put("clients/:linkId")
  updateClient(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("linkId") linkId: string,
    @Body() dto: UpdateClientLinkDto
  ) {
    return this.portfolio.updateClient(tenant, user.userId, linkId, dto);
  }

  @Get("access-codes")
  accessCodes(@CurrentTenant() tenant: TenantContext) {
    return this.portfolio.listAccessCodes(tenant);
  }

  @Post("access-codes")
  createAccessCode(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateAccessCodeDto) {
    assertTenantType(tenant, ["DISTRIBUTOR", "BRAND"]);
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR);
    return this.tenants.createAccessCode(tenant.tenantId, dto);
  }

  @Delete("access-codes/:codeId")
  revokeAccessCode(@CurrentTenant() tenant: TenantContext, @Param("codeId") codeId: string) {
    assertTenantType(tenant, ["DISTRIBUTOR", "BRAND"]);
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_DISTRIBUTOR);
    return this.tenants.revokeOwnAccessCode(tenant, codeId);
  }

  // ---------- Chat (comercio y mayorista) ----------

  @Get("chats")
  chats(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.chat.list(tenant, user.userId);
  }

  @Get("chats/:linkId")
  chatThread(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("linkId") linkId: string
  ) {
    return this.chat.listMessages(tenant, user.userId, linkId);
  }

  @Post("chats/:linkId")
  postChat(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param("linkId") linkId: string,
    @Body() dto: PostLinkMessageDto
  ) {
    return this.chat.post(tenant, user.userId, linkId, dto.body);
  }
}
