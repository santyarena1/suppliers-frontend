import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { FxService } from "../catalog-api/core/fx.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { SubscriptionsService } from "./subscriptions.service";

/** Link fijo de siempre: se usa si todavía no hay credenciales de Mercado Pago cargadas. */
export const NODO_MERCADOPAGO_FALLBACK_URL = "https://mpago.la/1UXHapj";
const MP_PREFERENCES_URL = "https://api.mercadopago.com/checkout/preferences";

export interface MercadoPagoCheckout {
  url: string;
  /** `false` = link fijo (sin credenciales): el importe es el que tenga cargado ese link. */
  dynamic: boolean;
  amountUsd: number | null;
  amountArs: number | null;
  rate: number | null;
}

/**
 * Cobro del plan por Mercado Pago, armado en el momento: la cuota vigente del
 * comercio (plan + módulos, o el precio pactado) en pesos al dólar oficial del día.
 * Así el link nunca queda atrasado cuando cambia el precio o el dólar.
 *
 * Necesita `MERCADOPAGO_ACCESS_TOKEN` (credenciales de producción de la cuenta de
 * NODO en Mercado Pago). Sin eso, devuelve el link fijo de siempre.
 */
@Injectable()
export class MercadoPagoCheckoutService {
  private readonly logger = new Logger(MercadoPagoCheckoutService.name);

  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly fx: FxService
  ) {}

  async checkout(tenant: TenantContext): Promise<MercadoPagoCheckout> {
    const charge = await this.subscriptions.chargeFor(tenant);
    const token = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
    if (!token) return { url: NODO_MERCADOPAGO_FALLBACK_URL, dynamic: false, amountUsd: charge.amountUsd, amountArs: null, rate: null };
    if (charge.amountUsd <= 0) throw new BadRequestException("Tu plan no tiene nada para pagar este mes.");

    const fx = await this.fx.forKey("oficial");
    if (!fx.rate) throw new BadGatewayException("No pudimos obtener el dólar del día. Probá de nuevo en un rato.");
    const amountArs = Math.ceil(charge.amountUsd * fx.rate);
    const web = (process.env.PUBLIC_WEB_URL || process.env.WEB_URL || "https://nodohub.app").trim().replace(/\/+$/, "");
    try {
      const res = await axios.post<{ init_point?: string }>(
        MP_PREFERENCES_URL,
        {
          items: [
            {
              id: `nodo-${charge.plan.toLowerCase()}`,
              title: `${charge.planLabel} · 1 mes`,
              description: `US$ ${charge.amountUsd} al dólar oficial de hoy ($ ${fx.rate.toLocaleString("es-AR")})`,
              quantity: 1,
              currency_id: "ARS",
              unit_price: amountArs,
            },
          ],
          external_reference: `nodo-sub:${tenant.tenantId}`,
          statement_descriptor: "NODO",
          back_urls: { success: `${web}/suscripcion?mp=ok`, pending: `${web}/suscripcion?mp=pendiente`, failure: `${web}/suscripcion?mp=error` },
          auto_return: "approved",
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15_000 }
      );
      const url = res.data?.init_point;
      if (!url) throw new Error("Mercado Pago no devolvió el link");
      return { url, dynamic: true, amountUsd: charge.amountUsd, amountArs, rate: fx.rate };
    } catch (err) {
      const msg = axios.isAxiosError(err) ? `${err.response?.status ?? ""} ${JSON.stringify(err.response?.data ?? err.message).slice(0, 300)}` : String(err);
      this.logger.warn(`Mercado Pago no armó el cobro de ${tenant.tenantId}: ${msg}`);
      throw new BadGatewayException("Mercado Pago no respondió. Probá de nuevo en un rato.");
    }
  }
}
