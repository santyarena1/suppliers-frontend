import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { type JwtPayload, type Provider, isProviderKey } from "@nodo/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { assertPermission, hasPermission } from "../tenants/tenant-roles";
import { TenantGuard } from "../tenants/tenant.guard";
import { CredentialsService } from "./credentials.service";
import { SaveCredentialDto } from "./dto/save-credential.dto";

function assertProvider(value: string): Provider {
  if (!isProviderKey(value)) {
    throw new BadRequestException(`Proveedor inválido: ${value}`);
  }
  return value as Provider;
}

/**
 * Las credenciales son las cuentas del comercio en cada distribuidor: solo las
 * ve y las toca quien tiene "Configurar proveedores". El resto sabe qué
 * proveedores están conectados, pero no las claves.
 */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("credentials")
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Get("me")
  async mine(@CurrentTenant() tenant: TenantContext) {
    const rows = await this.credentialsService.ofTenant(commercialId(tenant));
    if (hasPermission(tenant, "providers.manage")) return rows;
    return rows.map((row) => ({ ...row, credentialsJson: null }));
  }

  @Get(":providerName")
  async getByProvider(@CurrentTenant() tenant: TenantContext, @Param("providerName") providerName: string) {
    assertPermission(tenant, "providers.manage");
    return this.credentialsService.getByProvider(commercialId(tenant), assertProvider(providerName));
  }

  @Post()
  async save(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: SaveCredentialDto) {
    assertPermission(tenant, "providers.manage");
    return this.credentialsService.save(commercialId(tenant), user.userId, dto);
  }

  @Delete(":providerName")
  async delete(@CurrentTenant() tenant: TenantContext, @Param("providerName") providerName: string) {
    assertPermission(tenant, "providers.manage");
    return this.credentialsService.delete(commercialId(tenant), assertProvider(providerName));
  }
}
