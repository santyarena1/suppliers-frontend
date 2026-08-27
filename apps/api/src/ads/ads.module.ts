import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { AdminAdsController, PublicAdsController } from "./ads.admin.controller";
import { MyAdsController } from "./ads.my.controller";
import { AdsService } from "./ads.service";

@Module({
  imports: [TenantsModule],
  controllers: [AdminAdsController, PublicAdsController, MyAdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}
