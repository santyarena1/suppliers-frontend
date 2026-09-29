import { Module } from "@nestjs/common";
import { AdsModule } from "../ads/ads.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AdminNewsController, MyNewsController, NewsFeedController, PublicNewsController } from "./news.controller";
import { NewsService } from "./news.service";
import { NewsVisibilityService } from "./news-visibility.service";
import { NewsRsvpService } from "./news-rsvp.service";

@Module({
  imports: [TenantsModule, AdsModule],
  controllers: [NewsFeedController, MyNewsController, PublicNewsController, AdminNewsController],
  providers: [NewsService, NewsVisibilityService, NewsRsvpService],
  exports: [NewsService],
})
export class NewsModule {}
