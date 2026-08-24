import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ALL_PROVIDERS, TENANT_ROLES_CAN_MANAGE_COMMERCE, type JwtPayload, type Provider } from "@nodo/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { TenantContext } from "../tenants/tenant-context.service";
import { assertTenantRole } from "../tenants/tenant-roles";
import { TenantGuard } from "../tenants/tenant.guard";
import { CredentialsService } from "./credentials.service";
import { SaveCredentialDto } from "./dto/save-credential.dto";

function assertProvider(value: string): Provider {
  if (!ALL_PROVIDERS.includes(value as Provider)) {
    throw new BadRequestException(`Proveedor inválido: ${value}`);
  }
  return value as Provider;
}

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("credentials")
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Get("me")
  mine(@CurrentTenant() tenant: TenantContext) {
    return this.credentialsService.ofTenant(tenant.tenantId);
  }

  @Get(":providerName")
  getByProvider(@CurrentTenant() tenant: TenantContext, @Param("providerName") providerName: string) {
    return this.credentialsService.getByProvider(tenant.tenantId, assertProvider(providerName));
  }

  @Post()
  save(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: SaveCredentialDto) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    return this.credentialsService.save(tenant.tenantId, user.userId, dto);
  }

  @Delete(":providerName")
  delete(@CurrentTenant() tenant: TenantContext, @Param("providerName") providerName: string) {
    assertTenantRole(tenant, TENANT_ROLES_CAN_MANAGE_COMMERCE);
    return this.credentialsService.delete(tenant.tenantId, assertProvider(providerName));
  }
}
