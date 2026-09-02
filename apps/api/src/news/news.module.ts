import { Module } from "@nestjs/common";
import { AdsModule } from "../ads/ads.module";
import { TenantsModule } from "../tenants/tenants.module";
import { MyNewsController, NewsFeedController, PublicNewsController } from "./news.controller";
import { NewsService } from "./news.service";
import { NewsVisibilityService } from "./news-visibility.service";

@Module({
  imports: [TenantsModule, AdsModule],
  controllers: [NewsFeedController, MyNewsController, PublicNewsController],
  providers: [NewsService, NewsVisibilityService],
  exports: [NewsService],
})
export class NewsModule {}
