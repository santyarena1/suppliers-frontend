import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdsService } from "./ads.service";
import { AdTrackDto, UpdateAdSlotDto } from "./dto/ads.dto";

@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/ads")
export class AdminAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  list() {
    return this.ads.adminList();
  }

  @Put("slots/:slotId")
  updateSlot(@Param("slotId") slotId: string, @Body() dto: UpdateAdSlotDto) {
    return this.ads.adminUpdateSlot(slotId, dto);
  }
}

@Controller("ads")
export class PublicAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get("creatives")
  creatives(@Query("placement") placement?: string) {
    return this.ads.publicCreatives(placement);
  }

  @Post("campaigns/:campaignId/track")
  track(@Param("campaignId") campaignId: string, @Body() dto: AdTrackDto) {
    return this.ads.track(campaignId, dto.kind, dto.path);
  }
}
