import { BadGatewayException, BadRequestException } from "@nestjs/common";
import { ElitWebClient } from "./elit-web-client";
import { ElitOrderService } from "./elit-order.service";

function summary(over: Record<string, unknown> = {}) {
  return {
    details: [
      {
        code: 18636,
        name: "AP Cudy",
        price: 12.5,
        cart: [{ warehouse: 9, quantity: 1 }],
      },
    ],
    saleConditions: [{ code: 101, name: "Transferencia", surcharge: 0 }],
    warehouses: [{ warehouse: 9, name: "Buenos Aires" }],
    shippingMethods: [
      {
        warehouse: 9,
        name: "Buenos Aires",
        shippings: [
          { code: 4, name: "Retira depósito", cost: 0, selected: true },
          { code: 14, name: "Retira comisionista", cost: 0, selected: false },
        ],
      },
    ],
    shippingAddresses: [{ code: "D1", address: "Calle Falsa", city: "CABA", zipCode: "1000" }],
    total: { subtotal: 12.5, vat: 2.625, internalTax: 0, perceptions: { total: 0 }, finalTotal: 15.125 },
    currentExchange: 1200,
    saleCondition: "101",
    shippingAddress: "D1",
    ...over,
  };
}

/**
 * Portal simulado con estado: arranca con un resto de otra sesión (código 111)
 * y refleja lo que se borra o se agrega, como el carrito real de Elit.
 * `acceptUpTo` limita lo que Elit acepta por código (sin stock).
 */
function stubApi(acceptUpTo: Record<number, number> = {}) {
  const cart = new Map<number, number>([[111, 2]]);
  const api = {
    getJson: jest.fn(),
    postJson: jest.fn(),
  };
  api.getJson.mockImplementation(async (path: string) => {
    if (path === "cart") {
      return { data: { details: [...cart].map(([code, quantity]) => ({ code, cart: [{ warehouse: 9, quantity }] })) } };
    }
    if (path === "cart/summary") return { data: summary() };
    return { data: {} };
  });
  api.postJson.mockImplementation(async (path: string, body: { code?: number; quantity?: number }) => {
    if (path === "cart/process") return { data: [{ number: "9900123", reference: "NV-1" }] };
    if (path === "cart/update" && body?.code && body.quantity === 0) cart.delete(body.code);
    if (path === "cart/add" && body?.code && body.quantity) {
      cart.set(body.code, Math.min(body.quantity, acceptUpTo[body.code] ?? body.quantity));
    }
    return { data: body ?? {} };
  });
  return api;
}

const ITEMS = [{ code: "18636", qty: 1, name: "AP Cudy" }];
const CREDS = { id: "12345", password: "x" };

const AUTOR = { userId: "user-1", tenantId: "tenant-1" };

describe("ElitOrderService", () => {
  let api: ReturnType<typeof stubApi>;
  let service: ElitOrderService;
  let createOrder: jest.Mock;

  beforeEach(() => {
    api = stubApi();
    jest.spyOn(ElitWebClient, "login").mockResolvedValue(api as never);
    createOrder = jest.fn(async ({ data }) => ({
      ...data,
      id: "nodo-elit-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    service = new ElitOrderService(
      { providerOrder: { create: createOrder, findMany: jest.fn() } } as never,
      { load: jest.fn(async () => null), save: jest.fn(async () => undefined), clear: jest.fn(async () => undefined) } as never
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("el preview vacía leftover, agrega y no llama process", async () => {
    const preview = await service.preview(CREDS, { items: ITEMS });
    expect(api.postJson).toHaveBeenCalledWith("cart/update", { code: 111, quantity: 0, warehouse: 9 });
    expect(api.postJson).toHaveBeenCalledWith("cart/add", { code: 18636, quantity: 1 });
    expect(api.postJson).toHaveBeenCalledWith(
      "cart/option",
      expect.objectContaining({ shippingWarehouse: 9, shippingMethod: 4, saleCondition: 101, shippingAddress: "D1" }),
    );
    expect(api.postJson.mock.calls.some((c) => c[0] === "cart/process")).toBe(false);
    expect(preview.items[0]).toMatchObject({ code: "18636", qty: 1, name: "AP Cudy", price: 12.5, subtotal: 12.5 });
    expect(preview.stockOk).toBe(true);
    expect(preview.total).toBe(15.125);
    expect(preview.perceptions).toBe(0);
    expect(preview.note).toMatch(/cart\/process/);
  });

  it("un producto sin stock no tira abajo la cotización: se informa para sacarlo", async () => {
    const base = api.postJson.getMockImplementation()!;
    api.postJson.mockImplementation(async (path: string, body: { code?: number }) => {
      if (path === "cart/add" && body?.code === 99999) {
        throw new BadRequestException("Elit POST cart/add → 400: No stock available");
      }
      return base(path, body);
    });
    const preview = await service.preview(CREDS, { items: [...ITEMS, { code: "99999", qty: 2, name: "Sin stock" }] });
    expect(preview.unavailable).toEqual([{ code: "99999", name: "Sin stock", qty: 2 }]);
    expect(preview.items[0]).toMatchObject({ code: "18636" });
  });

  it("si nada tiene stock, error claro con la lista (no pide cargar la cuenta)", async () => {
    api.postJson.mockImplementation(async (path: string) => {
      if (path === "cart/add") throw new BadRequestException("Elit POST cart/add → 400: No stock available");
      return { data: {} };
    });
    await expect(service.preview(CREDS, { items: ITEMS })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "ELIT_NO_STOCK", details: { unavailable: [{ code: "18636", name: "AP Cudy", qty: 1 }] } }),
    });
  });

  it("no confirma un pedido a medias si falta stock de algo", async () => {
    const base = api.postJson.getMockImplementation()!;
    api.postJson.mockImplementation(async (path: string, body: { code?: number }) => {
      if (path === "cart/add" && body?.code === 99999) throw new BadRequestException("Elit POST cart/add → 400: No stock available");
      return base(path, body);
    });
    await expect(
      service.submitDraft(AUTOR, CREDS, { items: [...ITEMS, { code: "99999", qty: 1, name: "Sin stock" }], warehouse: 9 } as never)
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "ELIT_NO_STOCK" }) });
    expect(api.postJson.mock.calls.some((c) => c[0] === "cart/process")).toBe(false);
  });

  it("al verificar concilia el carrito de la cuenta con el de NODO y avisa qué cambió", async () => {
    const snapshots = { load: jest.fn(async () => ({ "18636": 1, "555": 2 })), save: jest.fn(async () => undefined), clear: jest.fn(async () => undefined) };
    service = new ElitOrderService({ providerOrder: { create: createOrder, findMany: jest.fn() } } as never, snapshots as never);
    // NODO: 18636 y 555. Portal: solo 111 (nuevo). La foto tenía 18636 y 555: el portal los perdió.
    // NODO manda: se vuelven a cargar (y se informa); 111 queda pendiente.
    const preview = await service.preview(CREDS, { items: [...ITEMS, { code: "555", qty: 2 }] }, { tenantId: "t1" });
    expect(preview.sync).toEqual({
      removedInPortal: [],
      addedInPortal: [{ code: "111", qty: 2, name: "111" }],
      qtyChangedInPortal: [],
      summedInBoth: [],
      keptNodoQty: [],
      restoredInPortal: [
        { code: "18636", qty: 1, name: "AP Cudy" },
        { code: "555", qty: 2 },
      ],
    });
    expect(api.postJson).toHaveBeenCalledWith("cart/add", { code: 18636, quantity: 1 });
    expect(api.postJson).toHaveBeenCalledWith("cart/add", { code: 555, quantity: 2 });
    expect(api.postJson).toHaveBeenCalledWith("cart/add", { code: 111, quantity: 2 });
    // La foto es el carrito de NODO; 111 no entra hasta que el comercio lo deje en NODO.
    expect(snapshots.save).toHaveBeenCalledWith("t1", "ELIT", { "18636": 1, "555": 2 });
  });

  it("sin tenant (confirmar pedido) no concilia: el carrito es lo que NODO manda", async () => {
    await service.preview(CREDS, { items: ITEMS });
    expect(api.getJson.mock.calls.filter((c) => c[0] === "cart")).toHaveLength(1);
  });

  it("suma percepciones IIBB al total aunque Elit no las ponga en finalTotal", async () => {
    api.getJson.mockImplementation(async (path: string) => {
      if (path === "cart") return { data: { details: [] } };
      if (path === "cart/summary") {
        return {
          data: summary({
            total: {
              subtotal: 50.01,
              vat: 5.25,
              internalTax: 0,
              perceptions: { total: 1.5, details: [{ name: "Percep. II.BB. C.A.B.A", amount: 1.5 }] },
              finalTotal: 55.26,
            },
          }),
        };
      }
      return { data: {} };
    });
    const preview = await service.preview(CREDS, { items: ITEMS });
    expect(preview.perceptions).toBe(1.5);
    expect(preview.perceptionLines).toEqual([{ label: "Percep. II.BB. C.A.B.A", amount: 1.5 }]);
    expect(preview.total).toBe(56.76);
  });

  it("sin depósito no procesa", async () => {
    await expect(service.submitDraft(AUTOR, CREDS, { items: ITEMS })).rejects.toBeInstanceOf(BadRequestException);
    expect(api.postJson.mock.calls.some((c) => c[0] === "cart/process")).toBe(false);
  });

  it("process manda solo warehouse y guarda el nro de NV", async () => {
    const result = await service.submitDraft(AUTOR, CREDS, { items: ITEMS, warehouse: 9 });
    const processCall = api.postJson.mock.calls.find((c) => c[0] === "cart/process");
    expect(processCall?.[1]).toEqual({ warehouse: 9 });
    expect(result.orderNumber).toBe("9900123");
    expect(createOrder.mock.calls.at(-1)?.[0].data.status).toBe("CREATED");
  });

  it("si Elit acepta menos de lo pedido no manda la nota de venta", async () => {
    api = stubApi({ 18636: 1 });
    jest.spyOn(ElitWebClient, "login").mockResolvedValue(api as never);
    await expect(
      service.submitDraft(AUTOR, CREDS, { items: [{ code: "18636", qty: 5, name: "AP Cudy" }], warehouse: 9 })
    ).rejects.toThrow(/AP Cudy: pediste 5, Elit aceptó 1/);
    expect(api.postJson.mock.calls.some((call) => call[0] === "cart/process")).toBe(false);
  });

  it("si process falla deja FAILED y no marca creado", async () => {
    const portal = api.postJson.getMockImplementation()!;
    api.postJson.mockImplementation(async (path: string, body: unknown) => {
      if (path === "cart/process") throw new Error("Elit POST cart/process → 422: X is not allowed");
      return portal(path, body);
    });
    await expect(service.submitDraft(AUTOR, CREDS, { items: ITEMS, warehouse: 9 })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(createOrder.mock.calls[0][0].data.status).toBe("FAILED");
  });
});
