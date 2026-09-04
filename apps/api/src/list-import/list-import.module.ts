import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { ProvidersModule } from "../providers/providers.module";
import { TenantsModule } from "../tenants/tenants.module";
import { ListImportController } from "./list-import.controller";
import { ListImportSchedulerService } from "./list-import-scheduler.service";
import { ListImportService } from "./list-import.service";
import { ProfileLearner } from "./profile-learner";

/**
 * Importación de listas de precios para proveedores sin integración. Depende de
 * ProvidersModule para escribir ofertas con el mismo pipeline que un sync real.
 */
@Module({
  imports: [ProvidersModule, TenantsModule, CatalogModule],
  controllers: [ListImportController],
  providers: [ListImportService, ProfileLearner, ListImportSchedulerService],
  exports: [ListImportService],
})
export class ListImportModule {}
