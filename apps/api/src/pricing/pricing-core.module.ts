import { Module } from "@nestjs/common";
import { SaleMarginRulesService } from "./sale-margin-rules.service";
import { SalePricingInterceptor } from "./sale-pricing.interceptor";

/**
 * Base del modo vendedor: reglas de margen y el interceptor que pone precio de
 * venta. No depende de proveedores, así lo pueden importar Proveedores y la API
 * de catálogo sin dependencias circulares (va en su propio archivo por lo mismo).
 */
@Module({
  providers: [SaleMarginRulesService, SalePricingInterceptor],
  exports: [SaleMarginRulesService, SalePricingInterceptor],
})
export class PricingCoreModule {}
