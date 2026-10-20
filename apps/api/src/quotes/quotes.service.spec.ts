import { BadRequestException, ForbiddenException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { applySalePricing } from "../pricing/sale-pricing";
import type { TenantSaleRules } from "../pricing/sale-margin-rules.service";
import {
  addItem,
  atCostLines,
  customItem,
  initialsOf,
  readItems,
  repriceItems,
  summarize,
  totalsByCurrency,
  type QuoteItem,
} from "./quote-items";
import { effectiveStatus, QuotesService, seesAllQuotes, statusWhere } from "./quotes.service";

describe("statusWhere: el estado que se ve, como filtro", () => {
  const now = new Date("2026-10-19T12:00:00Z");

  it("vencido = borrador o enviado con la validez pasada", () => {
    expect(statusWhere("EXPIRED", now)).toEqual({ status: { in: ["DRAFT", "SENT"] }, validUntil: { lt: now } });
  });

  it("borrador y enviado no incluyen los vencidos", () => {
    expect(statusWhere("SENT", now)).toEqual({ status: "SENT", OR: [{ validUntil: null }, { validUntil: { gte: now } }] });
  });

  it("aceptado y rechazado no vencen", () => {
    expect(statusWhere("ACCEPTED", now)).toEqual({ status: "ACCEPTED" });
  });
});

const RULES: TenantSaleRules = {
  rules: new Map([["P:ELIT", 25]]),
  bases: new Map(),
  policies: new Map(),
};
const NO_RULES: TenantSaleRules = { rules: new Map(), bases: new Map(), policies: new Map() };

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
  clientEmail: string | null;
  notes: string | null;
  terms: string | null;
  items: unknown;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
  validUntil: Date | null;
  marginPercent: number | null;
  discountPercent: number | null;
  currency: string | null;
  sentAt: Date | null;
  decidedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function setup(
  product: Record<string, unknown> | null = PRODUCT,
  { rules = RULES, maxSellerDiscount = null }: { rules?: TenantSaleRules; maxSellerDiscount?: number | null } = {}
) {
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
        clientEmail: data.clientEmail ?? null,
        notes: data.notes ?? null,
        terms: null,
        items: [],
        status: "DRAFT",
        validUntil: data.validUntil ?? null,
        marginPercent: null,
        discountPercent: null,
        currency: null,
        sentAt: null,
        decidedAt: null,
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
    count: jest.fn(async ({ where }: { where: { tenantId: string; createdById?: string } }) =>
      [...rows.values()].filter((r) => r.tenantId === where.tenantId && (!where.createdById || r.createdById === where.createdById)).length
    ),
    groupBy: jest.fn(async () => []),
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
  const saleRules = { get: jest.fn(async () => rules) };
  const settings = { get: jest.fn(async () => ({ validityDays: 7, maxSellerDiscount })) };
  const service = new QuotesService(prisma as never, providers as never, saleRules as never, settings as never);
  return { service, prisma, providers, rows };
}

const sellerMode = { enforced: true, capabilities: { sellerMode: true } };
/** Vendedor: no ve costos. */
const seller = {
  tenantId: "t1",
  commercialTenantId: "t1",
  userId: "u-seller",
  tenantRole: "SELLER",
  tenantType: "RETAILER",
  permissions: [],
  entitlements: sellerMode,
} as never;
const otherSeller = { tenantId: "t1", commercialTenantId: "t1", userId: "u-other", tenantRole: "SELLER" } as never;
/** Dueño con el modo vendedor: ve costos. */
const owner = {
  tenantId: "t1",
  commercialTenantId: "t1",
  userId: "u-owner",
  tenantRole: "OWNER",
  tenantType: "RETAILER",
  permissions: ["prices.viewCost", "pricing.manage"],
  entitlements: sellerMode,
} as never;

/** Importes que solo tiene el costo: no pueden aparecer en ninguna respuesta. */
function expectNoCost(value: unknown) {
  const json = JSON.stringify(value);
  expect(json).not.toContain('"raw"');
  expect(json).not.toMatch(/:\s*121(?:[,}])/);
  expect(json).not.toMatch(/"price":\s*100\b/);
}

describe("QuotesService", () => {
  it("numera correlativo por comercio y arranca con la validez de la plantilla", async () => {
    const { service } = setup();
    const a = await service.create(seller, {});
    const b = await service.create(owner, { clientName: "Juan Pérez" });
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(b.initials).toBe("JP");
    expect(a.status).toBe("DRAFT");
    const days = (new Date(a.validUntil!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("guarda el precio de venta que ve el vendedor en la búsqueda y nunca el costo", async () => {
    const { service } = setup();
    const quote = await service.create(seller, {});
    const view = await service.addItem(seller, quote.id, { provider: "elit", externalId: "123", qty: 2 });
    const searched = applySalePricing({ ...PRODUCT }, { rules: RULES, hideCost: true }) as { price: number; finalPrice: number };
    expect(view.items[0]).toMatchObject({ unitPrice: searched.price, unitFinalPrice: searched.finalPrice, qty: 2, currency: "USD" });
    expect(view.totals.USD).toBeCloseTo(searched.finalPrice * 2, 2);
    // El vendedor no ve de dónde sale el margen (con el % se deduce el costo).
    expect(view.items[0].marginSource).toBeNull();
    expect(view.canEditMargins).toBe(false);
    expect(view.atCostLines).toBe(0);
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
    expect((await service.list(seller)).items.map((q) => q.id)).toEqual([mine.id]);
    expect((await service.list(owner)).items).toHaveLength(2);
    await expect(service.get(otherSeller, mine.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get(owner, mine.id)).resolves.toMatchObject({ id: mine.id, mine: false, createdByName: "vendedor" });
  });

  it("un presupuesto de otro comercio no existe", async () => {
    const { service } = setup();
    const quote = await service.create(seller, {});
    const foreignOwner = { tenantId: "t2", commercialTenantId: "t2", userId: "u-x", tenantRole: "OWNER" } as never;
    await expect(service.get(foreignOwner, quote.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("actualizar precios informa lo que cambió y renueva la validez", async () => {
    const { service, providers, rows } = setup();
    const quote = await service.create(seller, {});
    const before = await service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123" });
    rows.get(quote.id)!.validUntil = new Date(Date.now() - 1000);
    expect((await service.get(seller, quote.id)).status).toBe("EXPIRED");
    providers.getProduct.mockResolvedValueOnce({ ...PRODUCT, price: 110, finalPrice: 133.1 });
    const { quote: after, changes } = await service.refreshPrices(seller, quote.id);
    expect(changes).toHaveLength(1);
    expect(changes[0].before).toBe(before.items[0].unitFinalPrice);
    expect(changes[0].after).toBe(after.items[0].unitFinalPrice);
    expect(after.items[0].unitFinalPrice!).toBeGreaterThan(before.items[0].unitFinalPrice!);
    expect(after.status).toBe("DRAFT");
    expectNoCost({ after, changes });
  });

  it("cantidades, quitar, mover y archivar", async () => {
    const { service } = setup();
    const quote = await service.create(seller, {});
    await service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123" });
    await service.addCustom(seller, quote.id, { name: "Armado", unitFinalPrice: 20, currency: "USD" });
    expect((await service.updateItem(seller, quote.id, 0, { qty: 5 })).items[0].qty).toBe(5);
    expect((await service.moveItem(seller, quote.id, 1, 0)).items.map((i) => i.name)).toEqual(["Armado", "Mouse G502"]);
    await expect(service.moveItem(seller, quote.id, 0, 5)).rejects.toBeInstanceOf(BadRequestException);
    expect((await service.removeItem(seller, quote.id, 0)).items).toHaveLength(1);
    expect((await service.setArchived(seller, quote.id, true)).archivedAt).not.toBeNull();
    await expect(service.removeItem(seller, quote.id, 3)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe("márgenes", () => {
    it("sin márgenes configurados avisa que va al costo", async () => {
      const { service } = setup(PRODUCT, { rules: NO_RULES });
      const quote = await service.create(owner, {});
      const view = await service.addItem(owner, quote.id, { provider: "ELIT", externalId: "123" });
      expect(view.atCostLines).toBe(1);
      expect(view.items[0]).toMatchObject({ marginSource: "none", unitFinalPrice: 121 });
    });

    it("el dueño pone un margen para todo el presupuesto y se recalculan las líneas", async () => {
      const { service } = setup(PRODUCT, { rules: NO_RULES });
      const quote = await service.create(owner, {});
      await service.addItem(owner, quote.id, { provider: "ELIT", externalId: "123" });
      const view = await service.updateClient(owner, quote.id, { marginPercent: 10 });
      expect(view.marginPercent).toBe(10);
      expect(view.items[0]).toMatchObject({ unitFinalPrice: 133.1, unitPrice: 110, marginSource: "quote" });
      expect(view.atCostLines).toBe(0);
      // Lo que se agrega después también lleva ese margen.
      const added = await service.addItem(owner, quote.id, { provider: "ELIT", externalId: "999" });
      expect(added.items[1]).toMatchObject({ unitFinalPrice: 133.1, marginSource: "quote" });
    });

    it("el margen de una línea pisa al del presupuesto y se puede quitar", async () => {
      const { service } = setup();
      const quote = await service.create(owner, {});
      await service.addItem(owner, quote.id, { provider: "ELIT", externalId: "123" });
      const lined = await service.updateItem(owner, quote.id, 0, { marginPercent: 50 });
      expect(lined.items[0]).toMatchObject({ unitFinalPrice: 181.5, marginPercent: 50, marginSource: "line" });
      const back = await service.updateItem(owner, quote.id, 0, { marginPercent: null });
      expect(back.items[0]).toMatchObject({ unitFinalPrice: 151.25, marginPercent: null, marginSource: "provider" });
    });

    it("el vendedor no puede cambiar márgenes ni verlos", async () => {
      const { service } = setup();
      const quote = await service.create(seller, {});
      await service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123" });
      await expect(service.updateClient(seller, quote.id, { marginPercent: 5 })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.updateItem(seller, quote.id, 0, { marginPercent: 5 })).rejects.toBeInstanceOf(ForbiddenException);
      // Si el dueño le pone margen a un presupuesto del vendedor, el vendedor ve el precio pero no el %.
      await service.updateClient(owner, quote.id, { marginPercent: 30 });
      const seen = await service.get(seller, quote.id);
      expect(seen.marginPercent).toBeNull();
      expect(seen.items[0].marginPercent).toBeNull();
      expect(seen.items[0].marginSource).toBeNull();
      expect(seen.items[0].unitFinalPrice).toBe(157.3);
    });

    it("un margen fuera de rango se rechaza", async () => {
      const { service } = setup();
      const quote = await service.create(owner, {});
      await expect(service.updateClient(owner, quote.id, { marginPercent: 5000 })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("descuento y estados", () => {
    it("el descuento baja el total y respeta el tope del vendedor", async () => {
      const { service } = setup(PRODUCT, { maxSellerDiscount: 5 });
      const quote = await service.create(seller, {});
      await service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123", qty: 2 });
      await expect(service.updateClient(seller, quote.id, { discountPercent: 10 })).rejects.toBeInstanceOf(ForbiddenException);
      const view = await service.updateClient(seller, quote.id, { discountPercent: 5 });
      expect(view.subtotals.USD).toBe(302.5);
      expect(view.discounts.USD).toBe(15.13);
      expect(view.totals.USD).toBe(287.37);
      // El dueño no tiene tope.
      expect((await service.updateClient(owner, quote.id, { discountPercent: 20 })).totals.USD).toBe(242);
    });

    it("enviado, aceptado, rechazado", async () => {
      const { service } = setup();
      const quote = await service.create(seller, {});
      const sent = await service.markSent(seller, quote.id);
      expect(sent.status).toBe("SENT");
      expect(sent.sentAt).not.toBeNull();
      const accepted = await service.updateClient(seller, quote.id, { status: "ACCEPTED" });
      expect(accepted.status).toBe("ACCEPTED");
      expect(accepted.decidedAt).not.toBeNull();
      // Ya decidido: compartirlo de nuevo no lo vuelve a "enviado".
      expect((await service.markSent(seller, quote.id)).status).toBe("ACCEPTED");
    });

    it("duplicar copia cliente y líneas con número nuevo", async () => {
      const { service } = setup();
      const quote = await service.create(seller, { clientName: "Ana" });
      await service.addItem(seller, quote.id, { provider: "ELIT", externalId: "123", qty: 2 });
      await service.addCustom(seller, quote.id, { name: "Envío", unitFinalPrice: 5000, currency: "ARS" });
      const copy = await service.duplicate(seller, quote.id);
      expect(copy.number).toBe(2);
      expect(copy.clientName).toBe("Ana");
      expect(copy.items.map((i) => [i.name, i.qty])).toEqual([["Mouse G502", 2], ["Envío", 1]]);
      expect(copy.status).toBe("DRAFT");
    });
  });

  describe("líneas libres", () => {
    it("llevan precio a mano, no margen, y no cambian al actualizar precios", async () => {
      const { service } = setup();
      const quote = await service.create(seller, {});
      const view = await service.addCustom(seller, quote.id, { name: "Armado y prueba", unitFinalPrice: 24.2, currency: "USD", qty: 1 });
      expect(view.items[0]).toMatchObject({ kind: "custom", unitFinalPrice: 24.2, unitPrice: 20, marginSource: "manual" });
      await expect(service.updateItem(seller, quote.id, 0, { marginPercent: 10 })).rejects.toBeInstanceOf(BadRequestException);
      const edited = await service.updateItem(seller, quote.id, 0, { name: "Armado", unitFinalPrice: 30 });
      expect(edited.items[0]).toMatchObject({ name: "Armado", unitFinalPrice: 30 });
      const { quote: after, changes } = await service.refreshPrices(seller, quote.id);
      expect(changes).toEqual([]);
      expect(after.items[0].unitFinalPrice).toBe(30);
    });

    it("a un producto no se le cambia el nombre ni el precio a mano", async () => {
      const { service } = setup();
      const quote = await service.create(owner, {});
      await service.addItem(owner, quote.id, { provider: "ELIT", externalId: "123" });
      await expect(service.updateItem(owner, quote.id, 0, { unitFinalPrice: 1 })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

describe("ítems de presupuesto", () => {
  const item: QuoteItem = {
    kind: "product",
    provider: "ELIT",
    externalId: "1",
    name: "A",
    imageUrl: null,
    brand: null,
    sku: null,
    qty: 1,
    unitPrice: 10,
    unitFinalPrice: 12.1,
    currency: "USD",
    pricedAt: "2026-10-05T00:00:00.000Z",
    marginPercent: null,
    marginSource: "provider",
  };

  it("lee solo ítems válidos y acota la cantidad", () => {
    expect(readItems([{ provider: "ELIT", externalId: "1", qty: 0 }, { foo: 1 }, null, "x"])).toHaveLength(1);
    expect(readItems([{ provider: "ELIT", externalId: "1", qty: 99999 }])[0].qty).toBe(9999);
    expect(readItems(null)).toEqual([]);
  });

  it("los presupuestos viejos (sin origen del margen) no se marcan como al costo", () => {
    const [old] = readItems([{ provider: "ELIT", externalId: "1", unitFinalPrice: 10 }]);
    expect(old).toMatchObject({ kind: "product", marginSource: "store", marginPercent: null });
    expect(atCostLines([old])).toBe(0);
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

  it("totales por moneda, descuento e iniciales", () => {
    const lines = [item, { ...item, qty: 2, currency: "ARS", unitFinalPrice: 1000 }];
    expect(totalsByCurrency(lines)).toEqual({ USD: 12.1, ARS: 2000 });
    expect(summarize(lines, 10)).toEqual({
      subtotals: { USD: 12.1, ARS: 2000 },
      discounts: { USD: 1.21, ARS: 200 },
      totals: { USD: 10.89, ARS: 1800 },
    });
    expect(summarize(lines, null).discounts).toEqual({});
    expect(initialsOf("ana")).toBe("AN");
    expect(initialsOf("  ")).toBeNull();
    expect(initialsOf("PRUEBA CLAUDE (borrar)")).toBe("PC");
    expect(initialsOf("Casa & Co.")).toBe("CC");
    expect(initialsOf("Ñandú SRL")).toBe("ÑS");
    expect(initialsOf("(—)")).toBeNull();
  });

  it("línea libre: el neto sale del IVA", () => {
    const line = customItem({ id: "x", name: "Envío", unitFinalPrice: 110.5, currency: "ARS", qty: 1, ivaPercent: 10.5 }, new Date());
    expect(line).toMatchObject({ unitPrice: 100, unitFinalPrice: 110.5, kind: "custom", provider: "CUSTOM" });
  });

  it("vencido solo si nadie decidió", () => {
    const past = new Date(Date.now() - 1000);
    expect(effectiveStatus({ status: "SENT", validUntil: past } as never)).toBe("EXPIRED");
    expect(effectiveStatus({ status: "ACCEPTED", validUntil: past } as never)).toBe("ACCEPTED");
    expect(effectiveStatus({ status: "DRAFT", validUntil: null } as never)).toBe("DRAFT");
  });

  it("dueño y admin ven todo el equipo", () => {
    expect(seesAllQuotes({ tenantRole: "ADMIN" } as never)).toBe(true);
    expect(seesAllQuotes({ tenantRole: "BUYER" } as never)).toBe(false);
  });
});
