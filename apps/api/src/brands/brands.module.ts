import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { BrandOrgsService } from "./brand-orgs.service";
import { BrandLandingService } from "./brand-landing.service";
import { BrandActionsService } from "./brand-actions.service";
import { BrandNotificationsService } from "./brand-notifications.service";
import { BrandCatalogService } from "./brand-catalog.service";
import { BrandResourcesService } from "./brand-resources.service";
import { BrandHubService } from "./brand-hub.service";
import {
  AdminBrandsController,
  BrandPanelController,
  OrgNotificationsController,
  RetailerBrandsController,
} from "./brands.controller";
import { PublicBrandsController } from "./public-brands.controller";

@Module({
  imports: [TenantsModule],
  controllers: [
    BrandPanelController,
    RetailerBrandsController,
    OrgNotificationsController,
    AdminBrandsController,
    PublicBrandsController,
  ],
  providers: [
    BrandOrgsService,
    BrandLandingService,
    BrandActionsService,
    BrandNotificationsService,
    BrandCatalogService,
    BrandResourcesService,
    BrandHubService,
  ],
  exports: [BrandOrgsService, BrandNotificationsService],
})
export class BrandsModule {}
