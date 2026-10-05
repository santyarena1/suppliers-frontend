import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { ProvidersModule } from "../providers/providers.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AnnouncementsController } from "./announcements.controller";
import { PricingCoreModule } from "./pricing-core.module";
import { SaleMarginsController } from "./sale-margins.controller";
import { SaleMarginsService } from "./sale-margins.service";

/** Endpoints de márgenes de venta (modo vendedor) y avisos de novedades. */
@Module({
  imports: [PricingCoreModule, ProvidersModule, CatalogModule, TenantsModule],
  controllers: [SaleMarginsController, AnnouncementsController],
  providers: [SaleMarginsService],
})
export class PricingModule {}
