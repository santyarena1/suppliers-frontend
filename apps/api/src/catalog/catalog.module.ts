import { Module } from "@nestjs/common";
import { CryptoModule } from "../common/crypto/crypto.module";
import { CatalogAiService } from "./catalog-ai.service";
import { CatalogEnrichmentService } from "./catalog-enrichment.service";
import { CatalogSettingsService } from "./catalog-settings.service";

@Module({
  imports: [CryptoModule],
  providers: [CatalogEnrichmentService, CatalogAiService, CatalogSettingsService],
  exports: [CatalogEnrichmentService, CatalogSettingsService],
})
export class CatalogModule {}
