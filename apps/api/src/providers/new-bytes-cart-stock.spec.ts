import { BadRequestException } from "@nestjs/common";
import { NewBytesApiClient } from "./new-bytes-client";
import { NewBytesOrderService, nbLoadedLines } from "./new-bytes-order.service";

/**
 * `GET carrito` como lo devuelve New Bytes hoy: `{ Cart, items }`, cada renglón
 * es el producto del catálogo con `amountInCart`. El sitio muestra
 * `availableStock` ("10 o más"); `carrito/process` acepta hasta `amountStock`.
 */
function realShapeApi(stock: Record<number, { amountStock: number; availableStock: number }>) {
  let portal: { productId: number; amount: number }[] = [];
  const api = {
    patch: jest.fn(async (path: string) => {
      if (path === "carrito/empty") portal = [];
      return { ok: true };
    }),
    post: jest.fn(async (path: string, body?: { productId: number; amount: number }[]) => {
      if (path === "carrito/item") portal = body ?? [];
      if (path === "carrito/process") return { orderId: 1 };
      return { ok: true };
    }),
    get: jest.fn(async (path: string) => {
      if (path === "carrito") {
        // New Bytes no respeta el orden de carga.
        const items = [...portal].reverse().map((r) => ({
          id: r.productId,
          title: `Producto ${r.productId}`,
          amountInCart: r.amount,
          amountStock: stock[r.productId]?.amountStock ?? 99,
          availableStock: stock[r.productId]?.availableStock ?? 99,
          stockDisplayLimit: 10,
          price: { value: 100, iva: 21 },
        }));
        return { Cart: { id: 5 }, items };
      }
      if (path === "carrito/mediosDePago") return [{ payMethodId: 5, description: "Efectivo Caja", interest: 0 }];
      if (path === "carrito/availability") return { available: true };
      return [];
    }),
  };
  return api;
}

const CREDS = { user: "nb", password: "x" };

describe("New Bytes: stock real del carrito", () => {
  let api: ReturnType<typeof realShapeApi>;
  let service: NewBytesOrderService;
  let create: jest.Mock;

  beforeEach(() => {
    api = realShapeApi({ 111: { amountStock: 1, availableStock: 10 } });
    jest.spyOn(NewBytesApiClient, "login").mockResolvedValue(api as never);
    create = jest.fn(async ({ data }) => ({ ...data, id: "o1", createdAt: new Date(), updatedAt: new Date() }));
    service = new NewBytesOrderService(
      { providerOrder: { create, findMany: jest.fn() } } as never,
      { load: jest.fn(async () => null), save: jest.fn(async () => undefined), clear: jest.fn(async () => undefined) } as never
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it("lee código y cantidad de cada renglón por código, no por posición", async () => {
    const cart = await service.syncCart(CREDS, { items: [{ code: "111", qty: 1 }, { code: "222", qty: 3 }] });
    const byCode = Object.fromEntries(cart.items.map((it) => [it.code, it.qty]));
    expect(byCode).toEqual({ "111": 1, "222": 3 });
    expect(nbLoadedLines({ items: [{ id: 222, amountInCart: 3 }] })).toEqual([{ code: "222", qty: 3 }]);
  });

  it("cotiza lo que New Bytes deja comprar aunque el sitio diga 10 o más", async () => {
    const cart = await service.syncCart(CREDS, { items: [{ code: "111", qty: 3 }, { code: "222", qty: 2 }] });
    const line = cart.items.find((it) => it.code === "111");
    expect(line).toMatchObject({ qty: 1, stock: 1 });
    expect(cart.stockOk).toBe(false);
  });

  it("no manda a New Bytes un pedido sin stock: avisa qué producto y cuánto hay", async () => {
    const order = service.submitDraft({ userId: "u", tenantId: "t" }, CREDS, {
      items: [{ code: "111", qty: 3, name: "Mouse" }],
      delivery: "pickup",
      medioDePagoId: 5,
    });
    await expect(order).rejects.toThrow(BadRequestException);
    await expect(order).rejects.toThrow("Mouse: pediste 3, New Bytes tiene 1");
    expect(api.post).not.toHaveBeenCalledWith("carrito/process", expect.anything());
  });

  it("con stock suficiente el pedido sale", async () => {
    await service.submitDraft({ userId: "u", tenantId: "t" }, CREDS, {
      items: [{ code: "111", qty: 1, name: "Mouse" }, { code: "222", qty: 4, name: "Teclado" }],
      delivery: "pickup",
      medioDePagoId: 5,
    });
    expect(api.post).toHaveBeenCalledWith("carrito/process", expect.anything());
  });
});
