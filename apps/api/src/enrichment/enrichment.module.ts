import { Module } from "@nestjs/common";
import { AssetsModule } from "../assets/assets.module";
import { CatalogModule } from "../catalog/catalog.module";
import { ImagesModule } from "../images/images.module";
import { EnrichmentController } from "./enrichment.controller";
import { GroupingService } from "./grouping.service";
import { MastersService } from "./masters.service";
import { OfficialStoreImagesService } from "./official-store-images.service";
import { EnrichmentPipelineService } from "./pipeline.service";
import { RunsService } from "./runs.service";
import { SourceCacheService } from "./source-cache.service";

/** Productos enriquecidos (superadmin). Ver docs/PLAN_ENRIQUECIMIENTO.md. */
@Module({
  imports: [CatalogModule, AssetsModule, ImagesModule],
  controllers: [EnrichmentController],
  providers: [SourceCacheService, EnrichmentPipelineService, GroupingService, MastersService, RunsService, OfficialStoreImagesService],
})
export class EnrichmentModule {}
