import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { ProvidersModule } from "../providers/providers.module";
import { TenantsModule } from "../tenants/tenants.module";
import { RetailSupplierController } from "./retail-supplier.controller";
import { RetailSupplierService } from "./retail-supplier.service";

/** Locales de venta scrapeados como proveedores por lista, con descuentos por comercio. */
@Module({
  imports: [ProvidersModule, TenantsModule, CatalogModule],
  controllers: [RetailSupplierController],
  providers: [RetailSupplierService],
})
export class RetailSupplierModule {}
