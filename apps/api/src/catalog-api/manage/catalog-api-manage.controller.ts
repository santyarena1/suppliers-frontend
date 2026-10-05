import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiExcludeController } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsISO8601, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import { AllowWhenRestricted } from "../../tenants/entitlements";
import type { TenantContext } from "../../tenants/tenant-context.service";
import { TenantGuard } from "../../tenants/tenant.guard";
import { CatalogApiManageService } from "./catalog-api-manage.service";

export class AddonDto {
  @IsBoolean()
  enabled!: boolean;
}

/** La forma fina de `config`, `scopes` e IPs la valida el servicio (config-input.ts). */
export class ClientDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsArray()
  scopes?: string[];

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  ipAllowlist?: string[];

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601()
  expiresAt?: string | null;
}

export class WebhookCreateDto {
  @IsString()
  @MaxLength(2000)
  url!: string;

  @IsArray()
  events!: string[];
}

export class WebhookUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsArray()
  events?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UsageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

export class DeliveriesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** Configuración → API de catálogo (sesión del comercio). Ver docs/PLAN_API_CATALOGO.md §12. */
@ApiExcludeController()
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my/catalog-api")
export class CatalogApiManageController {
  constructor(private readonly manage: CatalogApiManageService) {}

  /** Con la suscripción suspendida se puede ver (y apagar el módulo), no operar. */
  @Get()
  @AllowWhenRestricted()
  overview(@CurrentTenant() tenant: TenantContext) {
    return this.manage.overview(tenant);
  }

  @Post("addon")
  @HttpCode(200)
  @AllowWhenRestricted()
  addon(@CurrentTenant() tenant: TenantContext, @Body() dto: AddonDto) {
    return this.manage.setAddon(tenant, dto.enabled);
  }

  @Post("clients")
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: ClientDto) {
    return this.manage.create(tenant, dto);
  }

  @Patch("clients/:id")
  update(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: ClientDto) {
    return this.manage.update(tenant, id, dto);
  }

  @Post("clients/:id/rotate")
  @HttpCode(200)
  rotate(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.manage.rotate(tenant, id);
  }

  @Post("clients/:id/revoke")
  @HttpCode(200)
  @AllowWhenRestricted()
  revoke(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.manage.revoke(tenant, id);
  }

  @Post("clients/:id/feed-token/rotate")
  @HttpCode(200)
  rotateFeedToken(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.manage.rotateFeedToken(tenant, id);
  }

  @Get("clients/:id/usage")
  @AllowWhenRestricted()
  usage(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Query() query: UsageQueryDto) {
    return this.manage.usage(tenant, id, query.days);
  }

  @Get("clients/:id/webhooks")
  @AllowWhenRestricted()
  webhooks(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.manage.listWebhooks(tenant, id);
  }

  @Post("clients/:id/webhooks")
  createWebhook(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: WebhookCreateDto) {
    return this.manage.createWebhook(tenant, id, dto);
  }

  @Patch("webhooks/:id")
  updateWebhook(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Body() dto: WebhookUpdateDto) {
    return this.manage.updateWebhook(tenant, id, dto);
  }

  @Delete("webhooks/:id")
  @AllowWhenRestricted()
  deleteWebhook(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.manage.deleteWebhook(tenant, id);
  }

  @Post("webhooks/:id/test")
  @HttpCode(200)
  testWebhook(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.manage.testWebhook(tenant, id);
  }

  @Post("webhooks/:id/rotate-secret")
  @HttpCode(200)
  rotateWebhookSecret(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    return this.manage.rotateWebhookSecret(tenant, id);
  }

  @Get("webhooks/:id/deliveries")
  @AllowWhenRestricted()
  deliveries(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @Query() query: DeliveriesQueryDto) {
    return this.manage.deliveries(tenant, id, query.limit);
  }
}
