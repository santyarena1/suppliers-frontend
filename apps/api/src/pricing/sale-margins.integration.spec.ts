// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { saleRuleKey } from "@nodo/shared";
import { SaleMarginRulesService } from "./sale-margin-rules.service";
import { SaleMarginsService, parseRuleKey } from "./sale-margins.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;
const TENANT = "sm-int-tenant";
const USER = "sm-int-user";
const PROVIDER = "ELIT";

d("Márgenes de venta contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const rules = new SaleMarginRulesService(prisma as never);
  const providers = { rulesByProvider: async () => new Map() };
  const enrichment = { getContext: async () => undefined };
  const service = new SaleMarginsService(prisma as never, rules, providers as never, enrichment as never);
  const writer = { tenantId: TENANT, userId: USER };

  async function cleanup() {
    await prisma.saleMarginChange.deleteMany({ where: { tenantId: TENANT } });
    await prisma.saleMarginRule.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenantProductOffer.deleteMany({ where: { tenantId: TENANT } });
    await prisma.providerSyncConfig.deleteMany({ where: { tenantId: TENANT } });
    await prisma.providerSyncCache.deleteMany({ where: { provider: PROVIDER, externalId: { startsWith: "sm-int-" } } });
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
  }

  beforeAll(async () => {
    await cleanup();
    await prisma.tenant.create({ data: { id: TENANT, name: "Márgenes Integración", type: "RETAILER", plan: "PRO" } });
    await prisma.user.create({ data: { id: USER, username: "sm-int-dueno", email: "sm-int@nodo.test" } });
    await prisma.providerSyncConfig.create({ data: { tenantId: TENANT, provider: PROVIDER } });
    const products: [string, string, number][] = [
      ["sm-int-1", "Placas de Video", 100],
      ["sm-int-2", "placas de video ", 200],
      ["sm-int-3", "Monitores", 300],
    ];
    for (const [id, category, price] of products) {
      await prisma.providerSyncCache.create({ data: { provider: PROVIDER, externalId: id, name: `Producto ${id}`, category, raw: {} } });
      await prisma.tenantProductOffer.create({ data: { tenantId: TENANT, provider: PROVIDER, externalId: id, price, ivaPercent: 21, currency: "USD" } });
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("lista las categorías del distribuidor unificando cómo las escribe", async () => {
    const res = await service.providerMargins(TENANT, PROVIDER);
    expect(res.base).toBe("FINAL");
    const placas = res.categories.find((c) => c.key === "placas de video");
    expect(placas).toMatchObject({ products: 2, percent: null, effective: 0, source: "none" });
    expect(res.categories.map((c) => c.key).sort()).toEqual(["monitores", "placas de video"]);
  });

  it("aplica un margen a varias categorías a la vez y deja historial", async () => {
    await service.setStore(writer, 5);
    await service.setProvider(writer, PROVIDER, { providerPercent: 10, base: "NET" });
    const res = await service.setCategories(writer, PROVIDER, ["placas de video", "Monitores"], 25);
    expect(res.base).toBe("NET");
    expect(res.categories.every((c) => c.percent === 25 && c.source === "category")).toBe(true);
    const sample = res.categories.find((c) => c.key === "monitores")?.sample;
    expect(sample).toMatchObject({ cost: 363, sale: 453.75 });
    const history = await service.history(TENANT, { provider: PROVIDER });
    expect(history.map((h) => h.scope)).toEqual(expect.arrayContaining(["STORE", "PROVIDER", "CATEGORY"]));
    expect(history.find((h) => h.ruleKey === saleRuleKey.category(PROVIDER, "monitores"))).toMatchObject({
      before: null,
      after: 25,
      label: "Monitores",
      userName: "sm-int-dueno",
    });
  });

  it("productos de una categoría paginados, con margen individual y masivo", async () => {
    const page1 = await service.products(TENANT, PROVIDER, { category: "Placas de video", limit: 1 });
    expect(page1.total).toBe(2);
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await service.products(TENANT, PROVIDER, { category: "Placas de video", limit: 1, cursor: page1.nextCursor ?? undefined });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    await service.setProducts(writer, PROVIDER, ["sm-int-1"], 50);
    const all = await service.products(TENANT, PROVIDER, { category: "placas de video" });
    const one = all.items.find((i) => i.externalId === "sm-int-1");
    expect(one).toMatchObject({ percent: 50, effective: 50, source: "product", sale: { price: 150, finalPrice: 181.5 } });
    const two = all.items.find((i) => i.externalId === "sm-int-2");
    expect(two).toMatchObject({ percent: null, effective: 25, source: "category" });
  });

  it("quitar el margen propio vuelve a heredar y queda en el historial", async () => {
    await service.setProducts(writer, PROVIDER, ["sm-int-1"], null);
    const all = await service.products(TENANT, PROVIDER, { q: "sm-int-1" });
    expect(all.items[0]).toMatchObject({ percent: null, source: "category", effective: 25 });
    const history = await service.history(TENANT, { provider: PROVIDER, limit: 1 });
    expect(history[0]).toMatchObject({ scope: "PRODUCT", before: 50, after: null, label: "Producto sm-int-1" });
  });

  it("rechaza márgenes fuera de rango, categorías y productos ajenos", async () => {
    await expect(service.setCategories(writer, PROVIDER, ["monitores"], 5000)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setCategories(writer, PROVIDER, ["heladeras"], 10)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setProducts(writer, PROVIDER, ["no-existe"], 10)).rejects.toThrow();
  });

  it("el caché de reglas se renueva al escribir", async () => {
    await service.setStore(writer, 7);
    expect((await rules.get(TENANT)).rules.get(saleRuleKey.store())).toBe(7);
  });
});

d("Márgenes por subcategoría contra Postgres (Elit: Hardware › …)", () => {
  const T2 = "sm-int-sub-tenant";
  const U2 = "sm-int-sub-user";
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const rules = new SaleMarginRulesService(prisma as never);
  const providers = { rulesByProvider: async () => new Map() };
  const enrichment = { getContext: async () => undefined };
  const service = new SaleMarginsService(prisma as never, rules, providers as never, enrichment as never);
  const writer = { tenantId: T2, userId: U2 };

  async function cleanup() {
    await prisma.saleMarginChange.deleteMany({ where: { tenantId: T2 } });
    await prisma.saleMarginRule.deleteMany({ where: { tenantId: T2 } });
    await prisma.tenantProductOffer.deleteMany({ where: { tenantId: T2 } });
    await prisma.providerSyncConfig.deleteMany({ where: { tenantId: T2 } });
    await prisma.providerSyncCache.deleteMany({ where: { provider: PROVIDER, externalId: { startsWith: "sm-sub-" } } });
    await prisma.user.deleteMany({ where: { id: U2 } });
    await prisma.tenant.deleteMany({ where: { id: T2 } });
  }

  beforeAll(async () => {
    await cleanup();
    await prisma.tenant.create({ data: { id: T2, name: "Márgenes Subcategorías", type: "RETAILER", plan: "PRO" } });
    await prisma.user.create({ data: { id: U2, username: "sm-sub-dueno", email: "sm-sub@nodo.test" } });
    await prisma.providerSyncConfig.create({ data: { tenantId: T2, provider: PROVIDER } });
    const products: [string, string, string | null, number][] = [
      ["sm-sub-1", "Hardware", "Placas de Video", 100],
      ["sm-sub-2", "HARDWARE", "placas de video", 200],
      ["sm-sub-3", "Hardware", "Fuentes", 50],
      ["sm-sub-4", "Periféricos", "Mouses", 20],
      ["sm-sub-5", "Periféricos", null, 30],
    ];
    for (const [id, category, subcategory, price] of products) {
      await prisma.providerSyncCache.create({ data: { provider: PROVIDER, externalId: id, name: `Producto ${id}`, category, subcategory, raw: {} } });
      await prisma.tenantProductOffer.create({ data: { tenantId: T2, provider: PROVIDER, externalId: id, price, ivaPercent: 21, currency: "USD" } });
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("cada categoría trae sus subcategorías (unificando cómo las escribe)", async () => {
    const res = await service.providerMargins(T2, PROVIDER);
    const hw = res.categories.find((c) => c.key === "hardware");
    expect(hw?.products).toBe(3);
    expect(hw?.subcategories.map((s) => [s.key, s.products])).toEqual([
      ["hardware>placas de video", 2],
      ["hardware>fuentes", 1],
    ]);
    const per = res.categories.find((c) => c.key === "perifericos");
    expect(per?.subcategories.map((s) => s.key)).toEqual(["perifericos>mouses"]);
  });

  it("margen a una subcategoría y a una categoría juntas; la subcategoría gana", async () => {
    await service.setCategories(writer, PROVIDER, ["hardware"], 10);
    const res = await service.setCategories(writer, PROVIDER, ["hardware>placas de video", "perifericos>mouses"], 30);
    const hw = res.categories.find((c) => c.key === "hardware")!;
    expect(hw).toMatchObject({ percent: 10, source: "category" });
    expect(hw.subcategories.find((s) => s.key === "hardware>placas de video")).toMatchObject({ percent: 30, effective: 30, source: "subcategory" });
    expect(hw.subcategories.find((s) => s.key === "hardware>fuentes")).toMatchObject({ percent: null, effective: 10, source: "category" });

    const placas = await service.products(T2, PROVIDER, { category: "hardware>placas de video" });
    expect(placas.total).toBe(2);
    expect(placas.items.every((i) => i.source === "subcategory" && i.effective === 30)).toBe(true);
    const fuentes = await service.products(T2, PROVIDER, { category: "hardware>fuentes" });
    expect(fuentes.items).toEqual([expect.objectContaining({ externalId: "sm-sub-3", source: "category", effective: 10 })]);

    const history = await service.history(T2, { provider: PROVIDER });
    expect(history.find((h) => h.ruleKey === saleRuleKey.subcategory(PROVIDER, "hardware", "placas de video"))).toMatchObject({
      scope: "CATEGORY",
      label: "Hardware › Placas de Video",
      after: 30,
    });
  });

  it("quitar el margen de la subcategoría vuelve a la categoría", async () => {
    const res = await service.setCategories(writer, PROVIDER, ["hardware>placas de video"], null);
    const sub = res.categories.find((c) => c.key === "hardware")!.subcategories.find((s) => s.key === "hardware>placas de video");
    expect(sub).toMatchObject({ percent: null, effective: 10, source: "category" });
  });

  it("rechaza subcategorías que el distribuidor no tiene", async () => {
    await expect(service.setCategories(writer, PROVIDER, ["hardware>heladeras"], 10)).rejects.toBeInstanceOf(BadRequestException);
  });
});

d("Margen por estado de una tienda de comercio contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const rules = new SaleMarginRulesService(prisma as never);
  const providers = { rulesByProvider: async () => new Map() };
  const enrichment = { getContext: async () => undefined };
  const service = new SaleMarginsService(prisma as never, rules, providers as never, enrichment as never);
  const BUYER = "sm-cond-buyer";
  const SELLER_TENANT = "sm-cond-seller";
  const SUPPLIER = "sm-cond-supplier";
  const STORE = "LIST_SM_COND_LOCAL";
  const writer = { tenantId: BUYER, userId: USER };

  async function cleanup() {
    await prisma.saleMarginChange.deleteMany({ where: { tenantId: BUYER } });
    await prisma.saleMarginRule.deleteMany({ where: { tenantId: BUYER } });
    await prisma.tenantProductOffer.deleteMany({ where: { tenantId: BUYER } });
    await prisma.providerSyncCache.deleteMany({ where: { provider: STORE } });
    await prisma.storefront.deleteMany({ where: { retailerTenantId: SELLER_TENANT } });
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.tenant.deleteMany({ where: { id: { in: [BUYER, SELLER_TENANT, SUPPLIER] } } });
  }

  beforeAll(async () => {
    await cleanup();
    await prisma.user.create({ data: { id: USER, username: "sm-cond-dueno", email: "sm-cond@nodo.test" } });
    await prisma.tenant.createMany({
      data: [
        { id: BUYER, name: "Comprador Estado", type: "RETAILER", plan: "PRO" },
        { id: SELLER_TENANT, name: "Local Estado", type: "RETAILER", plan: "PRO" },
        { id: SUPPLIER, name: "Local Estado (local)", type: "DISTRIBUTOR", providerKey: STORE },
      ],
    });
    const sf = await prisma.storefront.create({ data: { retailerTenantId: SELLER_TENANT, supplierTenantId: SUPPLIER } });
    const products: [string, string | null][] = [
      ["n1", "NEW"],
      ["u1", "USED"],
      ["u2", "USED"],
      ["x1", null],
    ];
    for (const [id, condition] of products) {
      await prisma.providerSyncCache.create({ data: { provider: STORE, externalId: id, name: `Notebook ${id}`, category: "Notebooks", raw: {} } });
      await prisma.tenantProductOffer.create({ data: { tenantId: BUYER, provider: STORE, externalId: id, price: 100, ivaPercent: 21, currency: "USD" } });
      if (condition) await prisma.storefrontItem.create({ data: { storefrontId: sf.id, externalId: id, condition } });
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("cuenta los productos de cada estado y aplica el margen al estado", async () => {
    const before = await service.providerMargins(BUYER, STORE);
    expect(before.conditions).toEqual([
      { condition: "NEW", products: 1, percent: null },
      { condition: "OPEN_BOX", products: 0, percent: null },
      { condition: "REFURBISHED", products: 0, percent: null },
      { condition: "USED", products: 2, percent: null },
    ]);
    await service.setProvider(writer, STORE, { providerPercent: 20 });
    const res = await service.setConditions(writer, STORE, ["USED"], 5);
    expect(res.conditions?.find((c) => c.condition === "USED")).toMatchObject({ percent: 5 });

    const page = await service.products(BUYER, STORE, {});
    const byId = new Map(page.items.map((p) => [p.externalId, p]));
    expect(byId.get("u1")).toMatchObject({ condition: "USED", effective: 5, source: "condition", sale: { finalPrice: 127.05 } });
    expect(byId.get("n1")).toMatchObject({ condition: "NEW", effective: 20, source: "provider" });
    expect(byId.get("x1")).toMatchObject({ condition: null, effective: 20, source: "provider" });

    // El precio de venta de todo NODO (búsqueda, presupuestos) usa el estado.
    rules.invalidate(BUYER);
    const loaded = await rules.get(BUYER);
    expect(loaded.conditions?.get(`${STORE}:u2`)).toBe("USED");

    const history = await service.history(BUYER, { provider: STORE });
    expect(history.find((h) => h.scope === "CONDITION")).toMatchObject({ label: "Estado: Usado", after: 5 });
  });

  it("a un distribuidor no se le pone margen por estado", async () => {
    expect((await service.providerMargins(BUYER, "ELIT")).conditions).toBeNull();
    await expect(service.setConditions(writer, "ELIT", ["USED"], 5)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("parseRuleKey", () => {
  it("lee las claves de regla", () => {
    expect(parseRuleKey("STORE").scope).toBe("STORE");
    expect(parseRuleKey("P:ELIT")).toMatchObject({ scope: "PROVIDER", provider: "ELIT" });
    expect(parseRuleKey("C:ELIT:placas de video")).toMatchObject({ scope: "CATEGORY", provider: "ELIT", id: "placas de video" });
    expect(parseRuleKey("C:ELIT:hardware>fuentes")).toMatchObject({ scope: "CATEGORY", fallbackLabel: "hardware › fuentes" });
    expect(parseRuleKey("X:LIST_NORTE:AB:12")).toMatchObject({ scope: "PRODUCT", provider: "LIST_NORTE", id: "AB:12" });
  });
});
