import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { type JwtPayload, type Provider, isProviderKey } from "@nodo/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { CredentialsService } from "./credentials.service";
import { SaveCredentialDto } from "./dto/save-credential.dto";

function assertProvider(value: string): Provider {
  if (!isProviderKey(value)) {
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
    return this.credentialsService.ofTenant(commercialId(tenant));
  }

  @Get(":providerName")
  getByProvider(@CurrentTenant() tenant: TenantContext, @Param("providerName") providerName: string) {
    return this.credentialsService.getByProvider(commercialId(tenant), assertProvider(providerName));
  }

  @Post()
  save(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload, @Body() dto: SaveCredentialDto) {
    return this.credentialsService.save(commercialId(tenant), user.userId, dto);
  }

  @Delete(":providerName")
  delete(@CurrentTenant() tenant: TenantContext, @Param("providerName") providerName: string) {
    return this.credentialsService.delete(commercialId(tenant), assertProvider(providerName));
  }
}
