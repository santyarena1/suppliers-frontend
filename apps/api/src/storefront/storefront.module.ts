import { Module } from "@nestjs/common";
import { ListImportModule } from "../list-import/list-import.module";
import { ProvidersModule } from "../providers/providers.module";
import { TenantsModule } from "../tenants/tenants.module";
import { StorefrontAdminController, StorefrontController } from "./storefront.controller";
import { StorefrontAudienceService } from "./storefront-audience.service";
import { StorefrontImagesService } from "./storefront-images.service";
import { StorefrontSheetService } from "./storefront-sheet.service";
import { StorefrontService } from "./storefront.service";
import { UpgradeRequestsService } from "./upgrade-requests.service";

/** Vender en NODO: tiendas de comercios y solicitudes para ser distribuidor o marca. */
@Module({
  imports: [ProvidersModule, TenantsModule, ListImportModule],
  controllers: [StorefrontController, StorefrontAdminController],
  providers: [StorefrontService, StorefrontAudienceService, StorefrontImagesService, StorefrontSheetService, UpgradeRequestsService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
