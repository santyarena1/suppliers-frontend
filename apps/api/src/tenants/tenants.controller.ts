import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import type { TenantRole } from "@nodo/shared";
import { PermissionChangesDto } from "./dto/permissions.dto";
import { TenantPermissionsService } from "./tenant-permissions.service";
import { TenantsService } from "./tenants.service";
import {
  CreateAccessCodeDto,
  CreateMembershipDto,
  CreateTenantDto,
  CreateTenantUserDto,
  SetProductManagerScopeDto,
  UpdateMembershipDto,
  UpdateTenantDto,
  UpsertLinkDto,
} from "./dto/tenant.dto";

/** Administración del árbol de organizaciones. Solo superadmin. */
@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/tenants")
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly permissions: TenantPermissionsService
  ) {}

  @Get()
  tree() {
    return this.tenants.tree();
  }

  @Get("users/:userId/relations")
  userRelations(@Param("userId") userId: string) {
    return this.tenants.userRelations(userId);
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.createTenant(dto);
  }

  @Get(":id/permissions")
  permissionsMatrix(@Param("id") id: string) {
    return this.permissions.matrix(id).then((matrix) => ({ ...matrix, canEdit: true }));
  }

  @Put(":id/roles/:role/permissions")
  setRolePermissions(@Param("id") id: string, @Param("role") role: string, @Body() dto: PermissionChangesDto) {
    return this.permissions.setRole(id, role as TenantRole, dto.changes).then((matrix) => ({ ...matrix, canEdit: true }));
  }

  @Put(":id/members/:membershipId/permissions")
  setMemberPermissions(
    @Param("id") id: string,
    @Param("membershipId") membershipId: string,
    @Body() dto: PermissionChangesDto
  ) {
    return this.permissions.setMember(id, membershipId, dto.changes).then((matrix) => ({ ...matrix, canEdit: true }));
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.updateTenant(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.tenants.deleteTenant(id);
  }

  @Post(":id/members")
  addMember(@Param("id") id: string, @Body() dto: CreateMembershipDto) {
    return this.tenants.addMember(id, dto);
  }

  @Post(":id/members/new-user")
  createMemberUser(@Param("id") id: string, @Body() dto: CreateTenantUserDto) {
    return this.tenants.createMemberUser(id, dto);
  }

  @Put("members/:membershipId")
  updateMember(@Param("membershipId") membershipId: string, @Body() dto: UpdateMembershipDto) {
    return this.tenants.updateMember(membershipId, dto);
  }

  @Delete("members/:membershipId")
  removeMember(@Param("membershipId") membershipId: string) {
    return this.tenants.removeMember(membershipId);
  }

  @Put("members/:membershipId/managed-brands")
  setManagedBrands(@Param("membershipId") membershipId: string, @Body() dto: SetProductManagerScopeDto) {
    return this.tenants.setProductManagerScope(membershipId, dto);
  }

  @Put("links")
  upsertLink(@Body() dto: UpsertLinkDto) {
    return this.tenants.upsertLink(dto);
  }

  @Delete("links/:linkId")
  deleteLink(@Param("linkId") linkId: string) {
    return this.tenants.deleteLink(linkId);
  }

  @Post(":id/access-codes")
  createAccessCode(@Param("id") id: string, @Body() dto: CreateAccessCodeDto) {
    return this.tenants.createAccessCode(id, dto);
  }

  @Delete("access-codes/:codeId")
  revokeAccessCode(@Param("codeId") codeId: string) {
    return this.tenants.revokeAccessCode(codeId);
  }
}
