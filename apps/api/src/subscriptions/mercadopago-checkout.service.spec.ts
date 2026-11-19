import axios from "axios";
import { MercadoPagoCheckoutService, NODO_MERCADOPAGO_FALLBACK_URL } from "./mercadopago-checkout.service";

jest.mock("axios");
const mocked = axios as jest.Mocked<typeof axios>;

describe("cobro del plan por Mercado Pago", () => {
  const tenant = { tenantId: "t1", tenantType: "RETAILER" } as never;
  const subs = { chargeFor: jest.fn(async () => ({ plan: "PRO", planLabel: "NODO Pro", amountUsd: 30 })) };
  const fx = { forKey: jest.fn(async () => ({ source: "oficial", rate: 1585.5, at: null, stale: false })) };
  const service = new MercadoPagoCheckoutService(subs as never, fx as never);
  const prev = process.env.MERCADOPAGO_ACCESS_TOKEN;
  afterEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = prev;
    jest.clearAllMocks();
  });

  it("sin credenciales: el link fijo de siempre", async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    await expect(service.checkout(tenant)).resolves.toMatchObject({ url: NODO_MERCADOPAGO_FALLBACK_URL, dynamic: false });
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it("con credenciales: la cuota de hoy en pesos al dólar oficial", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";
    mocked.post.mockResolvedValueOnce({ data: { init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1" } });
    const res = await service.checkout(tenant);
    expect(res).toEqual({ url: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1", dynamic: true, amountUsd: 30, amountArs: 47565, rate: 1585.5 });
    const body = mocked.post.mock.calls[0][1] as { items: { unit_price: number; currency_id: string; title: string }[]; external_reference: string };
    expect(body.items[0]).toMatchObject({ unit_price: 47565, currency_id: "ARS", title: "NODO Pro · 1 mes" });
    expect(body.external_reference).toBe("nodo-sub:t1");
  });
});
