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

function stubApi() {
  const leftoverCart = {
    details: [{ code: 111, cart: [{ warehouse: 9, quantity: 2 }] }],
  };
  const api = {
    getJson: jest.fn(),
    postJson: jest.fn(),
  };
  api.getJson.mockImplementation(async (path: string) => {
    if (path === "cart") return { data: leftoverCart };
    if (path === "cart/summary") return { data: summary() };
    return { data: {} };
  });
  api.postJson.mockImplementation(async (path: string, body: unknown) => {
    if (path === "cart/process") return { data: [{ number: "9900123", reference: "NV-1" }] };
    return { data: body ?? {} };
  });
  return api;
}

const ITEMS = [{ code: "18636", qty: 1, name: "AP Cudy" }];
const CREDS = { id: "12345", password: "x" };

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
    service = new ElitOrderService({
      providerOrder: { create: createOrder, findMany: jest.fn() },
    } as never);
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
    await expect(service.submitDraft("user-1", CREDS, { items: ITEMS })).rejects.toBeInstanceOf(BadRequestException);
    expect(api.postJson.mock.calls.some((c) => c[0] === "cart/process")).toBe(false);
  });

  it("process manda solo warehouse y guarda el nro de NV", async () => {
    const result = await service.submitDraft("user-1", CREDS, { items: ITEMS, warehouse: 9 });
    const processCall = api.postJson.mock.calls.find((c) => c[0] === "cart/process");
    expect(processCall?.[1]).toEqual({ warehouse: 9 });
    expect(result.orderNumber).toBe("9900123");
    expect(createOrder.mock.calls.at(-1)?.[0].data.status).toBe("CREATED");
  });

  it("si process falla deja FAILED y no marca creado", async () => {
    api.postJson.mockImplementation(async (path: string) => {
      if (path === "cart/process") throw new Error("Elit POST cart/process → 422: X is not allowed");
      return { data: {} };
    });
    await expect(service.submitDraft("user-1", CREDS, { items: ITEMS, warehouse: 9 })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(createOrder.mock.calls[0][0].data.status).toBe("FAILED");
  });
});
