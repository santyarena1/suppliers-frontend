import { Module } from "@nestjs/common";
import { CatalogNormalizeService } from "./catalog-normalize.service";
import { CatalogAdminController } from "./catalog-admin.controller";

@Module({
  controllers: [CatalogAdminController],
  providers: [CatalogNormalizeService],
  exports: [CatalogNormalizeService],
})
export class CatalogModule {}
