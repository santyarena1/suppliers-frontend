import { BadRequestException } from "@nestjs/common";
import { NewBytesApiClient } from "./new-bytes-client";
import { NewBytesOrderService } from "./new-bytes-order.service";

function stubApi() {
  const api = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  };

  api.post.mockImplementation(async (path: string) => {
    if (path === "carrito/new") return { ok: true };
    if (path === "carrito/item") return { ok: true };
    if (path === "carrito/process") return { orderId: 9901, branch: 1 };
    return {};
  });

  api.get.mockImplementation(async (path: string) => {
    if (path === "carrito") {
      return [{ productId: 108613, amount: 1, title: "RTX 3070", price: 1538.74, subtotal: 1538.74 }];
    }
    if (path === "carrito/subtotales") return { subTotalDollar: 1538.74, subTotalDollarFinal: 1538.74 };
    if (path === "carrito/availability") return { available: true };
    if (path === "carrito/mediosDePago") {
      return [
        { payMethodId: 3, description: "Depósito en Banco", interest: 0 },
        { payMethodId: 5, description: "Efectivo Caja", interest: 0 },
        { payMethodId: 11, description: "Tarjeta", interest: 0 },
      ];
    }
    if (path === "miCuenta/shippingAddress") {
      return [
        {
          id: "19337",
          direccion: "Av siempreviva 123",
          codigoPostal: "1407",
          localidad: "CABA",
          predeterminado: true,
        },
      ];
    }
    if (path.startsWith("carrito/calcularEnvioPara/")) {
      return {
        cotizacion: [
          { id: 3030, description: "Moto (Capital Federal)", plazoEntrega: "hoy", total: 3500 },
        ],
        datosBulto: { weightKg: 0.6, sizeCm: "12.16x12.16x12.16", amount: 1 },
      };
    }
    return [];
  });

  return api;
}

const ITEMS = [{ code: "108613", qty: 1, name: "RTX 3070" }];
const CREDS = { user: "nb", password: "x" };

const AUTOR = { userId: "user-1", tenantId: "tenant-1" };

describe("NewBytesOrderService", () => {
  let api: ReturnType<typeof stubApi>;
  let service: NewBytesOrderService;
  let createOrder: jest.Mock;

  beforeEach(() => {
    api = stubApi();
    jest.spyOn(NewBytesApiClient, "login").mockResolvedValue(api as never);
    createOrder = jest.fn(async ({ data }) => ({
      ...data,
      id: "nodo-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    service = new NewBytesOrderService({
      providerOrder: { create: createOrder, findMany: jest.fn() },
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("arma el carrito con POST /carrito/new, no asume retiro", async () => {
    const cart = await service.syncCart(CREDS, { items: ITEMS });
    expect(api.post).toHaveBeenCalledWith("carrito/new");
    expect(api.post).toHaveBeenCalledWith("carrito/item", [
      { productId: 108613, amount: 1, type: 0 },
    ]);
    expect(api.patch).not.toHaveBeenCalled();
    expect(cart.items[0].code).toBe("108613");
    expect(cart.pickup.postalCode).toBe("C1229ABF");
  });

  it("no cae a retiro si falta medio de envío: hay que elegir entrega", async () => {
    await expect(
      service.submitDraft(AUTOR, CREDS, {
        items: ITEMS,
        delivery: "shipping",
        medioDePagoId: 3,
        addressId: "19337",
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(api.post).not.toHaveBeenCalledWith("carrito/process", expect.anything());
  });

  it("el process de retiro no manda dirección ni cotización", async () => {
    const result = await service.submitDraft(AUTOR, CREDS, {
      items: ITEMS,
      delivery: "pickup",
      medioDePagoId: 5,
      notes: "retiro viernes",
    });
    expect(api.post).toHaveBeenCalledWith("carrito/process", {
      note: "retiro viernes",
      medioDePagoId: 5,
    });
    expect(result.orderNumber).toBe("9901");
    expect(result.deliveryLabel).toMatch(/Jujuy 1039/);
  });

  it("el process de envío manda mediodeEnvioId, idDirCli y datosBultos", async () => {
    await service.submitDraft(AUTOR, CREDS, {
      items: ITEMS,
      delivery: "shipping",
      medioDePagoId: 3,
      addressId: "19337",
      medioDeEnvioId: 3030,
      dropShipping: true,
      dropShippingClientName: "Moe",
      dropShippingClientEmail: "moe@example.com",
    });
    expect(api.get).toHaveBeenCalledWith("carrito/calcularEnvioPara/1407/19337");
    expect(api.post).toHaveBeenCalledWith("carrito/process", {
      note: "",
      medioDePagoId: 3,
      codigoPostalFavorito: "1407",
      mediodeEnvioId: 3030,
      idDirCli: "19337",
      datosBultos: { weightKg: 0.6, sizeCm: "12.16x12.16x12.16", amount: 1 },
      dropShipping: true,
      dpPayload: { clientName: "Moe", clientEmail: "moe@example.com" },
    });
  });

  it("rechaza Efectivo Caja cuando la entrega es envío", async () => {
    await expect(
      service.submitDraft(AUTOR, CREDS, {
        items: ITEMS,
        delivery: "shipping",
        medioDePagoId: 5,
        addressId: "19337",
        medioDeEnvioId: 3030,
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("la cotización usa el CP y el idDirCli de la dirección", async () => {
    const quoted = await service.quoteShippingForAddress(CREDS, {
      items: ITEMS,
      addressId: "19337",
    });
    expect(api.get).toHaveBeenCalledWith("carrito/calcularEnvioPara/1407/19337");
    expect(quoted.quotes[0]).toMatchObject({ id: "3030", label: "Moto (Capital Federal)", total: 3500 });
  });
});
