import { Module } from "@nestjs/common";
import { CatalogAiService } from "./catalog-ai.service";
import { CatalogEnrichmentService } from "./catalog-enrichment.service";

@Module({
  providers: [CatalogEnrichmentService, CatalogAiService],
  exports: [CatalogEnrichmentService],
})
export class CatalogModule {}
