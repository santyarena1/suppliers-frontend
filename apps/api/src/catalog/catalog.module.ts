import { Module, forwardRef } from "@nestjs/common";
import { CryptoModule } from "../common/crypto/crypto.module";
import { BrandsModule } from "../brands/brands.module";
import { CatalogAiService } from "./catalog-ai.service";
import { CatalogEnrichmentService } from "./catalog-enrichment.service";
import { CatalogSettingsService } from "./catalog-settings.service";

@Module({
  imports: [CryptoModule, forwardRef(() => BrandsModule)],
  providers: [CatalogEnrichmentService, CatalogAiService, CatalogSettingsService],
  exports: [CatalogEnrichmentService, CatalogSettingsService],
})
export class CatalogModule {}
