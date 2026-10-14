import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { TenantsModule } from "../tenants/tenants.module";
import { StorefrontAdminController, StorefrontController } from "./storefront.controller";
import { StorefrontService } from "./storefront.service";
import { UpgradeRequestsService } from "./upgrade-requests.service";

/** Vender en NODO: tiendas de comercios y solicitudes para ser distribuidor o marca. */
@Module({
  imports: [ProvidersModule, TenantsModule],
  controllers: [StorefrontController, StorefrontAdminController],
  providers: [StorefrontService, UpgradeRequestsService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
