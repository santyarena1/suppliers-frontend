import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { PcBuilderSettingsDto, SavePcBuildDto } from "./dto/pc-builder.dto";
import { PcBuilderService } from "./pc-builder.service";

/** Armador de PC: armados guardados, plantillas y lo que cobra el comercio por armar. */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("pc-builder")
export class PcBuilderController {
  constructor(private readonly builds: PcBuilderService) {}

  @Get("builds")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.builds.list(tenant);
  }

  @Get("builds/:id")
  get(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.builds.get(tenant, id);
  }

  @Post("builds")
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: SavePcBuildDto) {
    return this.builds.create(tenant, dto);
  }

  @Put("builds/:id")
  update(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: SavePcBuildDto) {
    return this.builds.update(tenant, id, dto);
  }

  @Delete("builds/:id")
  remove(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.builds.remove(tenant, id);
  }

  @Get("settings")
  settings(@CurrentTenant() tenant: TenantContext) {
    return this.builds.settings(tenant.tenantId);
  }

  @Put("settings")
  updateSettings(@CurrentTenant() tenant: TenantContext, @Body() dto: PcBuilderSettingsDto) {
    return this.builds.updateSettings(tenant, dto);
  }
}
