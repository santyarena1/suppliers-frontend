import { Module } from "@nestjs/common";
import { PricingCoreModule } from "../pricing/pricing-core.module";
import { ProvidersModule } from "../providers/providers.module";
import { TenantsModule } from "../tenants/tenants.module";
import { QuoteSettingsController, QuotesController } from "./quotes.controller";
import { QuoteSettingsService } from "./quote-settings.service";
import { QuotesService } from "./quotes.service";

/** Presupuestos de venta del modo vendedor y su plantilla. */
@Module({
  imports: [PricingCoreModule, ProvidersModule, TenantsModule],
  controllers: [QuotesController, QuoteSettingsController],
  providers: [QuotesService, QuoteSettingsService],
})
export class QuotesModule {}
