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

describe("parseRuleKey", () => {
  it("lee las claves de regla", () => {
    expect(parseRuleKey("STORE").scope).toBe("STORE");
    expect(parseRuleKey("P:ELIT")).toMatchObject({ scope: "PROVIDER", provider: "ELIT" });
    expect(parseRuleKey("C:ELIT:placas de video")).toMatchObject({ scope: "CATEGORY", provider: "ELIT", id: "placas de video" });
    expect(parseRuleKey("X:LIST_NORTE:AB:12")).toMatchObject({ scope: "PRODUCT", provider: "LIST_NORTE", id: "AB:12" });
  });
});
