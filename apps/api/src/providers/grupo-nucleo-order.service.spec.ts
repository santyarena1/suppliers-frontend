import { BadGatewayException, BadRequestException } from "@nestjs/common";
import { GrupoNucleoApiClient } from "./grupo-nucleo-client";
import { GrupoNucleoOrderService } from "./grupo-nucleo-order.service";

function stubApi() {
  const api = {
    get: jest.fn(),
    post: jest.fn(),
  };
  api.get.mockImplementation(async (path: string) => {
    if (path === "API_V1/GetUSDExchange") return { cotizacionUSD: 1000 };
    return {};
  });
  api.post.mockImplementation(async (path: string, body: unknown) => {
    if (path === "API_V1/CheckoutConfirm") {
      return [
        {
          item_id: 1429,
          precioNeto_USD: 2.33,
          impuestos: [{ imp_desc: "IVA 21%", imp_porcentaje: 21 }],
          stock_mdp: 0,
          stock_caba: 81,
        },
      ];
    }
    if (path === "API_V1_SSO/NewSelfSaleOrder") {
      return {
        error: 0,
        error_desc: "OK",
        pedidos: [
          {
            pedido: "58-189773",
            centroDistribucion: "Buenos Aires (Luna 551, CABA)",
            articulos: [{ precioNeto: 2176.66, moneda: "ARS", item_id: 1429, item_qty: 1 }],
          },
        ],
        faltantes: [],
      };
    }
    if (path === "API_V1_CSO/NewCustomerSaleOrder") {
      const rec = body as { items: { item_price: number }[]; cliente: { tipoDocumento: number } };
      return {
        error: 0,
        error_desc: "OK",
        idClienteGN: 1,
        pedidos: [
          {
            pedido: "58-189774",
            centroDistribucion: "Buenos Aires",
            articulos: [{ precioNeto: rec.items[0].item_price, moneda: "ARS", item_id: 1429, item_qty: 1 }],
          },
        ],
        faltantes: [],
      };
    }
    return {};
  });
  return api;
}

const ITEMS = [{ code: "1429", qty: 1, name: "Cable" }];
const CREDS = { id: "1022", username: "u", password: "x" };

const AUTOR = { userId: "user-1", tenantId: "tenant-1" };

describe("GrupoNucleoOrderService", () => {
  let api: ReturnType<typeof stubApi>;
  let service: GrupoNucleoOrderService;
  let createOrder: jest.Mock;

  beforeEach(() => {
    api = stubApi();
    jest.spyOn(GrupoNucleoApiClient, "login").mockResolvedValue(api as never);
    createOrder = jest.fn(async ({ data }) => ({
      ...data,
      id: "nodo-gn-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    service = new GrupoNucleoOrderService({
      providerOrder: { create: createOrder, findMany: jest.fn() },
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("el preview usa CheckoutConfirm y no inventa flete", async () => {
    const preview = await service.preview(CREDS, { items: ITEMS });
    expect(api.post).toHaveBeenCalledWith("API_V1/CheckoutConfirm", [1429]);
    expect(preview.items[0]).toMatchObject({ code: "1429", priceUsd: 2.33, stockCaba: 81, stockOk: true });
    expect(preview.usdExchange).toBe(1000);
    expect(preview.note).toMatch(/NewSelfSaleOrder/);
  });

  it("a mi nombre llama NewSelfSaleOrder con item_id/item_qty", async () => {
    const result = await service.submitDraft(AUTOR, CREDS, { items: ITEMS, notes: "Nodo" });
    expect(api.post).toHaveBeenCalledWith("API_V1_SSO/NewSelfSaleOrder", {
      nota: "Nodo",
      items: [{ item_id: 1429, item_qty: 1 }],
    });
    expect(result.orderNumber).toBe("58-189773");
    expect(createOrder).toHaveBeenCalled();
  });

  it("factura al cliente final exige datos y manda precio ARS >= catálogo", async () => {
    await expect(
      service.submitDraft(AUTOR, CREDS, { items: ITEMS, customerSale: true })
    ).rejects.toBeInstanceOf(BadRequestException);

    const result = await service.submitDraft(AUTOR, CREDS, {
      items: ITEMS,
      customerSale: true,
      customer: {
        nombre: "PRUEBA",
        documento: "20-11111111-9",
        tipoDocumento: 80,
        direccion: "TEST 1000",
        codigoPostal: "7600",
        ciudad: "Mar del Plata",
        codProvincia: 1,
        email: "test@test.com",
        tel: "111",
      },
    });
    const call = api.post.mock.calls.find((c) => c[0] === "API_V1_CSO/NewCustomerSaleOrder");
    expect(call).toBeTruthy();
    expect(call?.[1]).toMatchObject({
      cliente: { documento: "20111111119", tipoDocumento: 80, codProvincia: 1 },
      items: [{ item_id: 1429, item_qty: 1, item_price: 2330 }],
    });
    expect(result.orderNumber).toBe("58-189774");
  });

  it("si GN responde error no marca CREATED", async () => {
    api.post.mockImplementation(async (path: string) => {
      if (path === "API_V1/CheckoutConfirm") {
        return [{ item_id: 1429, precioNeto_USD: 2.33, impuestos: [], stock_mdp: 0, stock_caba: 1 }];
      }
      if (path === "API_V1_SSO/NewSelfSaleOrder") {
        return { error: 1, error_desc: "sin stock", pedidos: [], faltantes: [1429] };
      }
      return {};
    });
    await expect(service.submitDraft(AUTOR, CREDS, { items: ITEMS })).rejects.toBeInstanceOf(BadGatewayException);
    expect(createOrder.mock.calls[0][0].data.status).toBe("FAILED");
  });
});
