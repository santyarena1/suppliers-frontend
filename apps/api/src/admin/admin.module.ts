import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CatalogModule } from "../catalog/catalog.module";
import { UsersModule } from "../users/users.module";
import { AdminController, PlatformController } from "./admin.controller";
import { CatalogEnrichmentController } from "./catalog-enrichment.controller";
import { AdminService } from "./admin.service";
import { ProviderMergeService } from "./provider-merge.service";

@Module({
  imports: [UsersModule, AuthModule, CatalogModule],
  controllers: [AdminController, PlatformController, CatalogEnrichmentController],
  providers: [AdminService, ProviderMergeService],
  exports: [AdminService],
})
export class AdminModule {}
