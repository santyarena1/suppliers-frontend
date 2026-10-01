import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CatalogModule } from "../catalog/catalog.module";
import { UsersModule } from "../users/users.module";
import { AdminController, PlatformController } from "./admin.controller";
import { CatalogEnrichmentController } from "./catalog-enrichment.controller";
import { PlatformHealthController } from "./platform-health.controller";
import { AdminService } from "./admin.service";
import { ProviderMergeService } from "./provider-merge.service";
import { PlatformHealthService } from "./platform-health.service";

@Module({
  imports: [UsersModule, AuthModule, CatalogModule],
  controllers: [
    AdminController,
    PlatformController,
    CatalogEnrichmentController,
    PlatformHealthController,
  ],
  providers: [AdminService, ProviderMergeService, PlatformHealthService],
  exports: [AdminService],
})
export class AdminModule {}
