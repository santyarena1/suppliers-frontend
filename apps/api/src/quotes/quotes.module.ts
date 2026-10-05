import { Module } from "@nestjs/common";
import { PricingCoreModule } from "../pricing/pricing-core.module";
import { ProvidersModule } from "../providers/providers.module";
import { TenantsModule } from "../tenants/tenants.module";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";

/** Presupuestos de venta del modo vendedor. */
@Module({
  imports: [PricingCoreModule, ProvidersModule, TenantsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
