import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { AdsService } from "./ads.service";
import { UpsertAdCampaignDto } from "./dto/ads.dto";

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my/ads")
export class MyAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  overview(@CurrentTenant() tenant: TenantContext) {
    return this.ads.myOverview(tenant);
  }

  @Post("campaigns")
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: UpsertAdCampaignDto) {
    return this.ads.upsertCampaign(tenant, dto);
  }

  @Put("campaigns/:id")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body() dto: UpsertAdCampaignDto
  ) {
    return this.ads.upsertCampaign(tenant, dto, id);
  }
}
