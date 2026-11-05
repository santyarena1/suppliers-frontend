import { BadGatewayException, BadRequestException } from "@nestjs/common";
import { NewBytesApiClient } from "./new-bytes-client";
import { nbCatalogStock, nbLoadedLines, nbSellableStock, NewBytesOrderService } from "./new-bytes-order.service";


type CatalogRow = { id: number; amountStock: number; availableStock: number; stockDisplayLimit: number };

/**
 * New Bytes como responde hoy: `GET carrito` es `{ Cart, items }`, con renglones
 * sin datos de stock; el stock solo está en el catálogo (`GET /`), y un producto
 * agotado directamente no aparece ahí, aunque `carrito/item` lo acepte igual.
 */
function realShapeApi(catalog: CatalogRow[] | "falla") {
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
      if (path === "/") {
        if (catalog === "falla") throw new Error("timeout");
        return catalog;
      }
      if (path === "carrito") {
        // New Bytes no respeta el orden de carga.
        const items = [...portal].reverse().map((r) => ({
          id: r.productId,
          title: `Producto ${r.productId}`,
          amountInCart: r.amount,
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
const AUTHOR = { userId: "u", tenantId: "t" };
const row = (id: number, amountStock: number, availableStock = amountStock): CatalogRow => ({ id, amountStock, availableStock, stockDisplayLimit: 10 });

function setup(catalog: CatalogRow[] | "falla") {
  const api = realShapeApi(catalog);
  jest.spyOn(NewBytesApiClient, "login").mockResolvedValue(api as never);
  const create = jest.fn(async ({ data }) => ({ ...data, id: "o1", createdAt: new Date(), updatedAt: new Date() }));
  const service = new NewBytesOrderService(
    { providerOrder: { create, findMany: jest.fn() } } as never,
    { load: jest.fn(async () => null), save: jest.fn(async () => undefined), clear: jest.fn(async () => undefined) } as never
  );
  return { api, service, create };
}

const order = (items: { code: string; qty: number; name?: string }[]) => ({ items, delivery: "pickup" as const, medioDePagoId: 5 });

describe("New Bytes: stock real del catálogo", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lee código y cantidad de cada renglón por código, no por posición", async () => {
    const { service } = setup([row(111, 5), row(222, 5)]);
    const cart = await service.syncCart(CREDS, { items: [{ code: "111", qty: 1 }, { code: "222", qty: 3 }] });
    expect(Object.fromEntries(cart.items.map((it) => [it.code, it.qty]))).toEqual({ "111": 1, "222": 3 });
    expect(nbLoadedLines({ items: [{ id: 222, amountInCart: 3 }] })).toEqual([{ code: "222", qty: 3 }]);
  });

  it("un producto que ya no está en el catálogo se cotiza como agotado aunque el carrito lo acepte", async () => {
    const { service } = setup([row(111, 5)]);
    const cart = await service.syncCart(CREDS, { items: [{ code: "111", qty: 1 }, { code: "999", qty: 2 }] });
    expect(cart.items.find((it) => it.code === "999")).toMatchObject({ qty: 0, stock: 0, inCart: 2 });
    expect(cart.stockOk).toBe(false);
  });

  it("no manda un pedido con un producto agotado: dice cuál es", async () => {
    const { service, api } = setup([row(111, 5)]);
    const sent = service.submitDraft(AUTHOR, CREDS, order([{ code: "111", qty: 1, name: "Mouse" }, { code: "999", qty: 2, name: "Mother" }]));
    await expect(sent).rejects.toThrow(BadRequestException);
    await expect(sent).rejects.toThrow("Mother: pediste 2, New Bytes tiene 0");
    expect(api.post).not.toHaveBeenCalledWith("carrito/process", expect.anything());
  });

  it("frena lo que supera un stock informado con número exacto", async () => {
    const { service, api } = setup([row(111, 2)]);
    await expect(service.submitDraft(AUTHOR, CREDS, order([{ code: "111", qty: 3, name: "Mouse" }]))).rejects.toThrow("Mouse: pediste 3, New Bytes tiene 2");
    expect(api.post).not.toHaveBeenCalledWith("carrito/process", expect.anything());
  });

  it("«10 o más» no es un límite: pedir 15 se intenta", async () => {
    const { service, api } = setup([row(111, 10)]);
    await service.submitDraft(AUTHOR, CREDS, order([{ code: "111", qty: 15, name: "Mouse" }]));
    expect(api.post).toHaveBeenCalledWith("carrito/process", expect.anything());
  });

  it("con stock suficiente el pedido sale", async () => {
    const { service, api } = setup([row(111, 1), row(222, 4)]);
    await service.submitDraft(AUTHOR, CREDS, order([{ code: "111", qty: 1, name: "Mouse" }, { code: "222", qty: 4, name: "Teclado" }]));
    expect(api.post).toHaveBeenCalledWith("carrito/process", expect.anything());
  });

  it("si el catálogo no se puede leer no frena el pedido", async () => {
    const { service, api } = setup("falla");
    await service.submitDraft(AUTHOR, CREDS, order([{ code: "111", qty: 3, name: "Mouse" }]));
    expect(api.post).toHaveBeenCalledWith("carrito/process", expect.anything());
  });

  it("si New Bytes igual rechaza por stock, señala lo más probable en vez del error crudo", async () => {
    const { service, api, create } = setup([row(111, 5, 10)]);
    const portal = api.post.getMockImplementation()!;
    api.post.mockImplementation(async (path, body) => {
      if (path === "carrito/process") throw new BadRequestException("NewBytes POST carrito/process → 400: Uno o mas de los productos no tienen suficiente stock");
      return portal(path, body);
    });
    const sent = service.submitDraft(AUTHOR, CREDS, order([{ code: "111", qty: 6, name: "Mouse" }]));
    await expect(sent).rejects.toThrow(BadGatewayException);
    await expect(sent).rejects.toThrow("Producto 111: pediste 6, informa 5");
    expect(create.mock.calls[0][0].data.errorMessage).not.toMatch(/carrito\/process/);
  });

  it("lee el catálogo aunque no haya número firme", () => {
    const catalog = nbCatalogStock([{ id: 1, amountStock: 7, availableStock: 7, stockDisplayLimit: 10 }, { id: 2, amountStock: 20, availableStock: 10, stockDisplayLimit: 10 }, { id: 3 }]);
    expect(nbSellableStock(catalog, "1")).toBe(7);
    expect(nbSellableStock(catalog, "2")).toBeUndefined();
    expect(nbSellableStock(catalog, "3")).toBeUndefined();
    expect(nbSellableStock(catalog, "4")).toBe(0);
    expect(nbSellableStock(null, "4")).toBeUndefined();
    expect(nbCatalogStock([])).toBeNull();
  });
});
