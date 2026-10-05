import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { applySalePricing } from "../pricing/sale-pricing";
import type { TenantSaleRules } from "../pricing/sale-margin-rules.service";
import { addItem, initialsOf, readItems, repriceItems, totalsByCurrency, type QuoteItem } from "./quote-items";
import { QuotesService, seesAllQuotes } from "./quotes.service";

const RULES: TenantSaleRules = {
  rules: new Map([["P:ELIT", 25]]),
  bases: new Map(),
  policies: new Map(),
};

const PRODUCT = {
  provider: "ELIT",
  externalId: "123",
  name: "Mouse G502",
  brand: "Logitech",
  sku: "G502",
  imageUrl: "https://img/1.jpg",
  currency: "USD",
  price: 100,
  finalPrice: 121,
  ivaPercent: 21,
  category: "Mouses",
  raw: { precio: 100 },
};

type Row = {
  id: string;
  tenantId: string;
  number: number;
  createdById: string;
  clientName: string | null;
  clientPhone: string | null;
  notes: string | null;
  items: unknown;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function setup(product: Record<string, unknown> | null = PRODUCT) {
  const rows = new Map<string, Row>();
  let seq = 0;
  const salesQuote = {
    aggregate: jest.fn(async ({ where }: { where: { tenantId: string } }) => ({
      _max: { number: [...rows.values()].filter((r) => r.tenantId === where.tenantId).reduce((m, r) => Math.max(m, r.number), 0) || null },
    })),
    create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
      const row: Row = {
        id: `q${++seq}`,
        tenantId: data.tenantId!,
        number: data.number!,
        createdById: data.createdById!,
        clientName: data.clientName ?? null,
        clientPhone: data.clientPhone ?? null,
        notes: data.notes ?? null,
        items: [],
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
    findMany: jest.fn(async ({ where }: { where: { tenantId: string; createdById?: string } }) =>
      [...rows.values()].filter((r) => r.tenantId === where.tenantId && (!where.createdById || r.createdById === where.createdById))
    ),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = { ...rows.get(where.id)!, ...data, updatedAt: new Date() };
      rows.set(where.id, row);
      return row;
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => rows.delete(where.id)),
  };
  const user = { findMany: jest.fn(async () => [{ id: "u-seller", username: "vendedor" }, { id: "u-owner", username: "dueno" }]) };
  const tx = { salesQuote, user, $executeRaw: jest.fn() };
  const prisma = { salesQuote, user, $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const providers = { getProduct: jest.fn(async () => (product ? { ...product } : null)) };
  const saleRules = { get: jest.fn(async () => RULES) };
  const service = new QuotesService(prisma as never, providers as never, saleRules as never);
  return { service, prisma, providers, rows };
}

const seller = { tenantId: "t1", commercialTenantId: "t1", userId: "u-seller", tenantRole: "SELLER" } as never;
const otherSeller = { tenantId: "t1", commercialTenantId: "t1", userId: "u-other", tenantRole: "SELLER" } as never;
const owner = { tenantId: "t1", commercialTenantId: "t1", userId: "u-owner", tenantRole: "OWNER" } as never;

/** Importes que solo tiene el costo: no pueden aparecer en ninguna respuesta. */
function expectNoCost(value: unknown) {
  const json = JSON.stringify(value);
  expect(json).not.toContain('"raw"');
  expect(json).not.toMatch(/:\s*121(?:[,}])/);
  expect(json).not.toMatch(/"price":\s*100\b/);
}

describe("QuotesService", () => {
  it("numera correlativo por comercio", async () => {
    const { service } = setup();
    const a = await service.create(seller, {});
    const b = await service.create(owner, { clientName: "Juan Pérez" });
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(b.initials).toBe("JP");
  });

  it("guarda el precio de venta que ve el vendedor en la búsqueda y nunca el costo", async () => {
    const { service } = setup();
    const quote = await service.create(seller, {});
    const view = await service.addItem(seller, quote.id, { provider: "elit", externalId: "123", qty: 2 });
    const searched = applySalePricing({ ...PRODUCT }, { rules: RULES, hideCost: true }) as { price: number; finalPrice: number };
    expect(view.items[0]).toMatchObject({ unitPrice: searched.price, unitFinalPrice: searched.finalPrice, qty: 2, currency: "USD" });
    expect(view.totals.USD).toBeCloseTo(searched.finalPrice * 2, 2);
    expectNoCost(view);
  });

  it("sumar el mismo producto aumenta la cantidad", async () => {
    const { service } = setup();
    const quote = await service.create(seller, {});
    await service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123" });
    const view = await service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123", qty: 3 });
    expect(view.items).toHaveLength(1);
    expect(view.items[0].qty).toBe(4);
  });

  it("sin precio de venta no se puede agregar", async () => {
    const { service } = setup({ ...PRODUCT, price: null, finalPrice: null });
    const quote = await service.create(seller, {});
    await expect(service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123" })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("un producto que el comercio no ve no existe", async () => {
    const { service } = setup(null);
    const quote = await service.create(seller, {});
    await expect(service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("cada vendedor ve solo los suyos; el dueño ve todos", async () => {
    const { service } = setup();
    const mine = await service.create(seller, {});
    await service.create(otherSeller, {});
    expect((await service.list(seller)).map((q) => q.id)).toEqual([mine.id]);
    expect(await service.list(owner)).toHaveLength(2);
    await expect(service.get(otherSeller, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get(owner, mine.id)).resolves.toMatchObject({ id: mine.id, mine: false, createdByName: "vendedor" });
  });

  it("un presupuesto de otro comercio no existe", async () => {
    const { service } = setup();
    const quote = await service.create(seller, {});
    const foreignOwner = { tenantId: "t2", commercialTenantId: "t2", userId: "u-x", tenantRole: "OWNER" } as never;
    await expect(service.get(foreignOwner, quote.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("actualizar precios informa lo que cambió", async () => {
    const { service, providers } = setup();
    const quote = await service.create(seller, {});
    const before = await service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123" });
    providers.getProduct.mockResolvedValueOnce({ ...PRODUCT, price: 110, finalPrice: 133.1 });
    const { quote: after, changes } = await service.refreshPrices(seller, quote.id);
    expect(changes).toHaveLength(1);
    expect(changes[0].before).toBe(before.items[0].unitFinalPrice);
    expect(changes[0].after).toBe(after.items[0].unitFinalPrice);
    expect(after.items[0].unitFinalPrice!).toBeGreaterThan(before.items[0].unitFinalPrice!);
    expectNoCost({ after, changes });
  });

  it("cantidades, quitar y archivar", async () => {
    const { service } = setup();
    const quote = await service.create(seller, {});
    await service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123" });
    expect((await service.setItemQty(seller, quote.id, 0, 5)).items[0].qty).toBe(5);
    expect((await service.removeItem(seller, quote.id, 0)).items).toEqual([]);
    expect((await service.setArchived(seller, quote.id, true)).archivedAt).not.toBeNull();
    await expect(service.removeItem(seller, quote.id, 3)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ítems de presupuesto", () => {
  const item: QuoteItem = {
    provider: "ELIT", externalId: "1", name: "A", imageUrl: null, brand: null, sku: null,
    qty: 1, unitPrice: 10, unitFinalPrice: 12.1, currency: "USD", pricedAt: "2026-10-05T00:00:00.000Z",
  };

  it("lee solo ítems válidos y acota la cantidad", () => {
    expect(readItems([{ provider: "ELIT", externalId: "1", qty: 0 }, { foo: 1 }, null, "x"])).toHaveLength(1);
    expect(readItems([{ provider: "ELIT", externalId: "1", qty: 99999 }])[0].qty).toBe(9999);
    expect(readItems(null)).toEqual([]);
  });

  it("conserva el precio congelado al sumar el mismo producto", () => {
    const next = addItem([item], { ...item, unitFinalPrice: 99 }, 2, new Date());
    expect(next[0]).toMatchObject({ qty: 3, unitFinalPrice: 12.1 });
  });

  it("si el producto ya no tiene precio, queda el anterior y se avisa", () => {
    const { items, changes } = repriceItems([item], [null], new Date());
    expect(items[0].unitFinalPrice).toBe(12.1);
    expect(changes[0]).toMatchObject({ before: 12.1, after: null });
  });

  it("totales por moneda e iniciales", () => {
    expect(totalsByCurrency([item, { ...item, qty: 2, currency: "ARS", unitFinalPrice: 1000 }])).toEqual({ USD: 12.1, ARS: 2000 });
    expect(initialsOf("ana")).toBe("AN");
    expect(initialsOf("  ")).toBeNull();
  });

  it("dueño y admin ven todo el equipo", () => {
    expect(seesAllQuotes({ tenantRole: "ADMIN" } as never)).toBe(true);
    expect(seesAllQuotes({ tenantRole: "BUYER" } as never)).toBe(false);
  });
});
