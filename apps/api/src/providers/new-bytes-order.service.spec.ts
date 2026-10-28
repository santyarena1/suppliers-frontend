import { BadRequestException } from "@nestjs/common";
import { NewBytesApiClient } from "./new-bytes-client";
import { NewBytesOrderService } from "./new-bytes-order.service";

function stubApi(acceptUpTo: Record<number, number> = {}) {
  const api = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  };

  // Carrito del portal con estado: se vacía y se carga como el real.
  // `acceptUpTo` limita lo que New Bytes acepta por producto (sin stock).
  let portal: { productId: number; amount: number }[] = [];
  api.patch.mockImplementation(async (path: string) => {
    if (path === "carrito/empty") portal = [];
    return { ok: true };
  });

  api.post.mockImplementation(async (path: string, body?: { productId: number; amount: number }[]) => {
    if (path === "carrito/new") return { ok: true };
    if (path === "carrito/item") {
      portal = (body ?? []).map((it) => ({ productId: it.productId, amount: Math.min(it.amount, acceptUpTo[it.productId] ?? it.amount) }));
      return { ok: true };
    }
    if (path === "carrito/process") return { orderId: 9901, branch: 1 };
    return {};
  });

  api.get.mockImplementation(async (path: string) => {
    if (path === "carrito") {
      const rows = portal.length ? portal : [{ productId: 108613, amount: 1 }];
      return rows.map((r) => ({ ...r, title: "RTX 3070", price: 1538.74, subtotal: 1538.74 * r.amount }));
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
    service = new NewBytesOrderService(
      { providerOrder: { create: createOrder, findMany: jest.fn() } } as never,
      { load: jest.fn(async () => null), save: jest.fn(async () => undefined), clear: jest.fn(async () => undefined) } as never
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("un carrito anterior de NODO no aparece como cargado en New Bytes; lo puesto a mano sí", async () => {
    const fotos: Record<string, Record<string, number> | null> = {};
    const snapshots = {
      load: jest.fn(async (tenantId: string) => fotos[tenantId] ?? null),
      save: jest.fn(async (tenantId: string, _p: string, snap: Record<string, number> | null) => {
        fotos[tenantId] = snap;
      }),
      clear: jest.fn(async (tenantId: string) => {
        fotos[tenantId] = null;
      }),
    };
    service = new NewBytesOrderService({ providerOrder: { create: createOrder, findMany: jest.fn() } } as never, snapshots as never);

    // Cotiza con dos productos y después saca uno en NODO: New Bytes sigue con los dos.
    await service.syncCart(CREDS, { items: [{ code: "108613", qty: 1 }, { code: "555", qty: 2 }] }, { tenantId: "tenant-1" });
    expect((await service.readPortalCart(CREDS, "tenant-1")).items).toEqual([]);

    // En el portal cambia una cantidad y agrega otro producto a mano.
    await api.post("carrito/item", [
      { productId: 108613, amount: 4 },
      { productId: 555, amount: 2 },
      { productId: 777, amount: 1 },
    ]);
    const codes = (await service.readPortalCart(CREDS, "tenant-1")).items.map((it) => [it.code, it.qty]);
    expect(codes).toEqual([["108613", 4], ["777", 1]]);

    // Otro comercio (sin foto) ve todo lo del portal.
    expect((await service.readPortalCart(CREDS, "tenant-2")).items).toHaveLength(3);
  });

  it("después de pedir, lo pedido sigue en la foto", async () => {
    const save = jest.fn(async () => undefined);
    service = new NewBytesOrderService(
      { providerOrder: { create: createOrder, findMany: jest.fn() } } as never,
      { load: jest.fn(async () => null), save, clear: jest.fn(async () => undefined) } as never
    );
    await service.submitDraft(AUTOR, CREDS, { items: [{ code: "108613", qty: 1, name: "RTX 3070" }], delivery: "pickup", medioDePagoId: 5 });
    expect(save).toHaveBeenLastCalledWith("tenant-1", "NEW_BYTES", { "108613": 1 });
  });

  it("vacía el carrito de la cuenta antes de cargar lo de NODO, no asume retiro", async () => {
    const cart = await service.syncCart(CREDS, { items: ITEMS });
    expect(api.patch).toHaveBeenCalledWith("carrito/empty");
    expect(api.post).toHaveBeenCalledWith("carrito/new");
    expect(api.post).toHaveBeenCalledWith("carrito/item", [
      { productId: 108613, amount: 1, type: 0 },
    ]);
    const emptyOrder = api.patch.mock.invocationCallOrder[0];
    const itemOrder = api.post.mock.invocationCallOrder[api.post.mock.calls.findIndex(([p]) => p === "carrito/item")];
    expect(emptyOrder).toBeLessThan(itemOrder);
    expect(cart.items[0].code).toBe("108613");
    expect(cart.pickup.postalCode).toBe("C1229ABF");
  });

  it("el pedido lleva la cantidad de NODO: junta líneas repetidas y no suma lo viejo del portal", async () => {
    await service.submitDraft(AUTOR, CREDS, {
      items: [
        { code: "108613", qty: 2, name: "RTX 3070" },
        { code: "108613", qty: 1, name: "RTX 3070" },
        { code: "555", qty: 3 },
      ],
      delivery: "pickup",
      medioDePagoId: 5,
    });
    expect(api.patch).toHaveBeenCalledWith("carrito/empty");
    expect(api.post).toHaveBeenCalledWith("carrito/item", [
      { productId: 108613, amount: 3, type: 0 },
      { productId: 555, amount: 3, type: 0 },
    ]);
  });

  it("si New Bytes acepta menos de lo pedido no confirma el pedido", async () => {
    api = stubApi({ 108613: 1 });
    jest.spyOn(NewBytesApiClient, "login").mockResolvedValue(api as never);
    await expect(
      service.submitDraft(AUTOR, CREDS, { items: [{ code: "108613", qty: 4, name: "RTX 3070" }], delivery: "pickup", medioDePagoId: 5 })
    ).rejects.toThrow(/RTX 3070: pediste 4, New Bytes aceptó 1/);
    expect(api.post).not.toHaveBeenCalledWith("carrito/process", expect.anything());
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

  it("lee el carrito de la cuenta sin vaciarlo ni cargar nada", async () => {
    api.get.mockImplementation(async (path: string) => {
      if (path === "carrito") {
        return [
          { productId: 999, amount: 2, title: "Solo portal" },
          { productId: 999, amount: 1, title: "Solo portal" },
          { productId: 108613, amount: 1, title: "RTX 3070" },
        ];
      }
      return [];
    });
    const portal = await service.readPortalCart(CREDS);
    expect(portal.items).toEqual([
      { code: "999", qty: 3, name: "Solo portal" },
      { code: "108613", qty: 1, name: "RTX 3070" },
    ]);
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("lo que había solo en el portal no se suma ni queda pendiente", async () => {
    const preview = await service.preview(CREDS, { items: ITEMS, delivery: "pickup" }, { tenantId: "tenant-1" });
    expect(api.post).toHaveBeenCalledWith("carrito/item", [{ productId: 108613, amount: 1, type: 0 }]);
    expect(preview).not.toHaveProperty("sync");
  });

  it("la cotización usa el CP y el idDirCli de la dirección", async () => {
    const quoted = await service.quoteShippingForAddress(CREDS, {
      items: ITEMS,
      addressId: "19337",
    });
    expect(api.get).toHaveBeenCalledWith("carrito/calcularEnvioPara/1407/19337");
    expect(quoted.quotes[0]).toMatchObject({ id: "3030", label: "Moto (Capital Federal)", total: 3500 });
  });

  describe("varias operaciones a la vez sobre la misma cuenta", () => {
    // Como el portal real: `carrito/item` suma a lo que hay y cada llamada tarda.
    function slowPortal() {
      let portal: { productId: number; amount: number }[] = [];
      const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
      return {
        get: jest.fn(async (path: string) => {
          await tick();
          if (path === "carrito") return portal.map((r) => ({ ...r, title: "X", price: 10, subtotal: 10 * r.amount }));
          if (path === "carrito/availability") {
            return portal.map((r) => ({ productId: r.productId, available: r.amount <= 2 }));
          }
          if (path === "carrito/mediosDePago") return [{ payMethodId: 5, description: "Efectivo Caja", interest: 0 }];
          return [];
        }),
        patch: jest.fn(async (path: string) => {
          await tick();
          if (path === "carrito/empty") portal = [];
          return { ok: true };
        }),
        post: jest.fn(async (path: string, body?: { productId: number; amount: number }[]) => {
          await tick();
          if (path === "carrito/item") {
            for (const it of body ?? []) {
              const prev = portal.find((r) => r.productId === it.productId);
              if (prev) prev.amount += it.amount;
              else portal.push({ productId: it.productId, amount: it.amount });
            }
          }
          if (path === "carrito/process") {
            if (portal.length === 0) {
              throw new BadRequestException("NewBytes POST carrito/process → 400: El carrito está vacio, no se puede procesar");
            }
            portal = [];
            return { orderId: 77, branch: 1 };
          }
          return { ok: true };
        }),
      };
    }

    it("la precarga y la confirmación no se pisan: el pedido sale con el carrito entero", async () => {
      const live = slowPortal();
      jest.spyOn(NewBytesApiClient, "login").mockResolvedValue(live as never);
      const items = [{ code: "108613", qty: 2, name: "RTX 3070" }];
      const [warm, other, created] = await Promise.all([
        service.preview(CREDS, { items, delivery: "pickup" }, { tenantId: "tenant-1" }),
        service.syncCart(CREDS, { items }, { tenantId: "tenant-1" }),
        service.submitDraft(AUTOR, CREDS, { items, delivery: "pickup", medioDePagoId: 5 }),
      ]);
      // Sin sumar cantidades: New Bytes ve 2, no 4 ("poco stock").
      expect(warm.stockOk).toBe(true);
      expect(other.stockOk).toBe(true);
      expect(created.status).toBe("CREATED");
      expect(live.post.mock.calls.filter(([path]) => path === "carrito/process")).toHaveLength(1);
    });

    it("si el carrito quedó vacío al procesar, lo vuelve a cargar y reintenta una vez", async () => {
      const live = slowPortal();
      jest.spyOn(NewBytesApiClient, "login").mockResolvedValue(live as never);
      const realPost = live.post.getMockImplementation()!;
      let first = true;
      live.post.mockImplementation(async (path: string, body?: { productId: number; amount: number }[]) => {
        if (path === "carrito/process" && first) {
          first = false;
          await live.patch("carrito/empty"); // otra sesión del portal lo vació
        }
        return realPost(path, body);
      });
      const created = await service.submitDraft(AUTOR, CREDS, { items: ITEMS, delivery: "pickup", medioDePagoId: 5 });
      expect(created.status).toBe("CREATED");
      expect(live.post.mock.calls.filter(([path]) => path === "carrito/process")).toHaveLength(2);
    });
  });

  it("lo que cargó NODO en una cotización anterior no aparece como cargado en el portal", async () => {
    let foto: Record<string, number> | null = null;
    service = new NewBytesOrderService(
      { providerOrder: { create: createOrder, findMany: jest.fn() } } as never,
      {
        load: jest.fn(async () => foto),
        save: jest.fn(async (_t: string, _p: string, snap: Record<string, number> | null) => {
          foto = snap;
        }),
        clear: jest.fn(async () => undefined),
      } as never
    );
    // El carrito del comercio y, después, la cotización de un pedido retenido con otro producto.
    await service.syncCart(CREDS, { items: [{ code: "108613", qty: 1 }] }, { tenantId: "tenant-1" });
    await service.syncCart(CREDS, { items: [{ code: "555", qty: 3 }] }, { tenantId: "tenant-1" });
    // En New Bytes quedó lo de la primera carga.
    await api.post("carrito/item", [{ productId: 108613, amount: 1 }]);
    expect((await service.readPortalCart(CREDS, "tenant-1")).items).toEqual([]);
  });
});
