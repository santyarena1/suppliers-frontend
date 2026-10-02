import {
  freeShippingThresholdUsd,
  parseFreeShipping,
  qualifiesForFreeShipping,
} from "@nodo/shared";
import { ElitOrderService } from "./elit-order.service";
import { ElitWebClient } from "./elit-web-client";
import { NewBytesApiClient } from "./new-bytes-client";
import { NewBytesOrderService } from "./new-bytes-order.service";
import { PolytechClient } from "./polytech-client";
import { PolytechOrderService } from "./polytech-order.service";
import { atCheckout } from "./portal-shipping-options";

/** Cliente que solo sabe leer: cualquier escritura en el portal rompe el test. */
function readOnly(get: (path: string) => unknown) {
  const forbidden = () => {
    throw new Error("escribió en el portal");
  };
  return { get: jest.fn(async (p: string) => get(p)), getJson: jest.fn(async (p: string) => get(p)), post: forbidden, patch: forbidden, put: forbidden, delete: forbidden };
}

afterEach(() => jest.restoreAllMocks());

describe("formas de envío del portal (solo lectura)", () => {
  it("New Bytes cotiza para la dirección predeterminada con GETs, sin tocar el carrito", async () => {
    const api = readOnly((path) => {
      if (path === "miCuenta/shippingAddress") {
        return [
          { id: "a1", calle: "Otra 1", codigoPostal: "5000" },
          { id: "a2", calle: "Lisandro de la Torre 373", codigoPostal: "1408", predeterminado: true },
        ];
      }
      if (path.startsWith("carrito/calcularEnvioPara/1408/a2")) {
        return [{ id: "7", descripcion: "Moto (Capital Federal)", total: 11600, plazo: "entre hoy y el lunes" }];
      }
      throw new Error(`no esperado: ${path}`);
    });
    jest.spyOn(NewBytesApiClient, "login").mockResolvedValue(api as never);
    const svc = new NewBytesOrderService({} as never, {} as never);
    const out = await svc.shippingOptions({ user: "u", password: "p" });
    expect(out.status).toBe("live");
    expect(out.options).toEqual([
      expect.objectContaining({ id: "7", label: "Moto (Capital Federal)", amount: 11600, currency: "ARS", plazo: "entre hoy y el lunes" }),
    ]);
  });

  it("New Bytes sin cotización (carrito del portal vacío) avisa que cotiza al confirmar", async () => {
    const api = readOnly((path) => {
      if (path === "miCuenta/shippingAddress") return [{ id: "a2", calle: "X 1", codigoPostal: "1408", predeterminado: true }];
      throw new Error("sin carrito");
    });
    jest.spyOn(NewBytesApiClient, "login").mockResolvedValue(api as never);
    const out = await new NewBytesOrderService({} as never, {} as never).shippingOptions({ user: "u", password: "p" });
    expect(out.status).toBe("at-checkout");
    expect(out.options).toEqual([]);
  });

  it("Elit lee las formas por depósito del resumen del carrito con un GET", async () => {
    const api = readOnly((path) => {
      if (path === "cart/summary") {
        return {
          data: {
            shippingMethods: [
              { warehouse: 1, name: "CABA", shippings: [{ code: "RET", name: "Retiro", cost: 0 }, { code: "MOTO", name: "Moto", cost: 12.5 }] },
            ],
          },
        };
      }
      throw new Error(`no esperado: ${path}`);
    });
    jest.spyOn(ElitWebClient, "login").mockResolvedValue(api as never);
    const svc = new ElitOrderService({} as never, {} as never);
    const out = await svc.shippingOptions({ user: "u", password: "p" });
    expect(out.status).toBe("live");
    expect(out.options.map((o) => [o.label, o.amount, o.currency, o.group])).toEqual([
      ["Retiro", 0, "USD", "CABA"],
      ["Moto", 12.5, "USD", "CABA"],
    ]);
  });

  it("Polytech da los transportes sin costo", async () => {
    jest.spyOn(PolytechClient, "fromCredentials").mockResolvedValue({
      account: async () => ({ couriers: [{ id: "c1", name: "Andreani" }] }),
    } as never);
    const out = await new PolytechOrderService({} as never).shippingOptions({ username: "u", password: "p" });
    expect(out).toMatchObject({ status: "names-only", options: [{ id: "c1", label: "Andreani", amount: null }] });
  });

  it("los portales que solo cotizan al confirmar no se consultan", () => {
    expect(atCheckout("INVID")).toMatchObject({ status: "at-checkout", options: [] });
    expect(atCheckout("DISTECNA").note).toMatch(/Distecna/);
  });
});

describe("envío gratis desde $X", () => {
  it("se guarda con su moneda; vacío o 0 es sin envío gratis", () => {
    expect(parseFreeShipping(300000, "ARS")).toEqual({ amount: 300000, currency: "ARS" });
    expect(parseFreeShipping("200", "USD")).toEqual({ amount: 200, currency: "USD" });
    expect(parseFreeShipping(150, "EUR")).toEqual({ amount: 150, currency: "ARS" });
    expect(parseFreeShipping(0, "ARS")).toBeNull();
    expect(parseFreeShipping(null, "ARS")).toBeNull();
  });

  it("compara contra el total del pedido en USD con la cotización", () => {
    const pesos = { amount: 300000, currency: "ARS" as const };
    expect(freeShippingThresholdUsd(pesos, 1500)).toBe(200);
    expect(qualifiesForFreeShipping(199.996, pesos, 1500)).toBe(true); // redondeo de centavos
    expect(qualifiesForFreeShipping(199.9, pesos, 1500)).toBe(false);
    expect(qualifiesForFreeShipping(190, pesos, 1500)).toBe(false);
    expect(qualifiesForFreeShipping(250, { amount: 200, currency: "USD" }, 0)).toBe(true);
  });

  it("en pesos sin cotización no se puede decidir: no regala el envío", () => {
    expect(freeShippingThresholdUsd({ amount: 300000, currency: "ARS" }, 0)).toBeNull();
    expect(qualifiesForFreeShipping(999999, { amount: 300000, currency: "ARS" }, 0)).toBe(false);
  });
});
