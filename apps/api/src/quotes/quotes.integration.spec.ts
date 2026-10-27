// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
import { PrismaClient } from "@prisma/client";
import { saleRuleKey } from "@nodo/shared";
import { SaleMarginRulesService } from "../pricing/sale-margin-rules.service";
import { QuoteSettingsService } from "./quote-settings.service";
import { QuotesService } from "./quotes.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;
const TENANT = "q-int-tenant";
const SELLER = "q-int-seller";
const OWNER = "q-int-owner";

d("Presupuestos contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const rules = new SaleMarginRulesService(prisma as never);
  const providers = {
    getProduct: async (_t: string, provider: string, externalId: string) => externalId === "DADO-DE-BAJA" ? null : ({
      provider,
      externalId,
      name: "Monitor 24",
      currency: "USD",
      price: 100,
      finalPrice: 121,
      ivaPercent: 21,
      category: "Monitores",
      raw: {},
    }),
  };
  const settings = new QuoteSettingsService(prisma as never);
  const service = new QuotesService(prisma as never, providers as never, rules, settings);
  const seller = { tenantId: TENANT, commercialTenantId: TENANT, userId: SELLER, tenantRole: "SELLER" } as never;
  const owner = { tenantId: TENANT, commercialTenantId: TENANT, userId: OWNER, tenantRole: "OWNER" } as never;

  async function cleanup() {
    await prisma.salesQuote.deleteMany({ where: { tenantId: TENANT } });
    await prisma.saleMarginRule.deleteMany({ where: { tenantId: TENANT } });
    await prisma.user.deleteMany({ where: { id: { in: [SELLER, OWNER] } } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
  }

  beforeAll(async () => {
    await cleanup();
    await prisma.tenant.create({ data: { id: TENANT, name: "Presupuestos Integración", type: "RETAILER", plan: "PRO" } });
    await prisma.user.createMany({
      data: [
        { id: SELLER, username: "q-int-vendedor", email: "q-int-v@nodo.test" },
        { id: OWNER, username: "q-int-dueno", email: "q-int-d@nodo.test" },
      ],
    });
    await prisma.saleMarginRule.create({
      data: { tenantId: TENANT, scope: "PROVIDER", provider: "ELIT", ruleKey: saleRuleKey.provider("ELIT"), percent: 20 },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("armador: crea el presupuesto con todas las líneas de una vez y avisa lo que no tiene precio", async () => {
    const { quote, skipped } = await service.createWithItems(seller, {
      title: "PC gamer",
      clientName: "Tomás",
      items: [
        { provider: "ELIT", externalId: "CPU-1", qty: 1 },
        { provider: "ELIT", externalId: "RAM-1", qty: 2 },
        { provider: "ELIT", externalId: "DADO-DE-BAJA", qty: 1 },
      ],
      custom: [{ name: "Armado y prueba", unitFinalPrice: 45000, currency: "ARS", qty: 1, ivaPercent: 21 }],
    });
    expect(skipped).toEqual([{ provider: "ELIT", externalId: "DADO-DE-BAJA" }]);
    expect(quote).toMatchObject({ title: "PC gamer", clientName: "Tomás" });
    expect(quote.items.map((it) => [it.kind, it.qty])).toEqual([["product", 1], ["product", 2], ["custom", 1]]);
    await expect(service.createWithItems(seller, { items: [{ provider: "ELIT", externalId: "DADO-DE-BAJA" }] })).rejects.toThrow(/precio de venta/);
    await prisma.salesQuote.deleteMany({ where: { tenantId: TENANT } });
  });

  it("numera sin repetir aunque se creen a la vez", async () => {
    const created = await Promise.all(Array.from({ length: 6 }, () => service.create(seller, {})));
    expect(created.map((q) => q.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("guarda el precio de venta congelado y lo lista según quién mira", async () => {
    const quote = await service.create(seller, { clientName: "Ana Gómez", clientPhone: "1155550000" });
    const view = await service.addItem(seller, quote.id, { provider: "ELIT", externalId: "MON-24", qty: 2 });
    expect(view.items[0]).toMatchObject({ qty: 2, unitFinalPrice: 145.2, currency: "USD" });
    expect(view.totals).toEqual({ USD: 290.4 });
    expect(JSON.stringify(view)).not.toContain("121");

    const stored = await prisma.salesQuote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(JSON.stringify(stored.items)).not.toContain("121");

    const ownerList = (await service.list(owner)).items;
    expect(ownerList.find((q) => q.id === quote.id)).toMatchObject({ initials: "AG", createdByName: "q-int-vendedor", mine: false });
    expect((await service.list(owner, { q: "ana" })).items.map((q) => q.id)).toEqual([quote.id]);
    expect((await service.list(owner, { q: `#${quote.number}` })).items.map((q) => q.id)).toEqual([quote.id]);

    await service.setArchived(seller, quote.id, true);
    expect((await service.list(seller)).items.some((q) => q.id === quote.id)).toBe(false);
    expect((await service.list(seller, { archived: true })).items.map((q) => q.id)).toEqual([quote.id]);
  });

  it("plantilla, margen del presupuesto, descuento, líneas libres y estado se guardan en la base", async () => {
    const ownerFull = {
      tenantId: TENANT,
      commercialTenantId: TENANT,
      userId: OWNER,
      tenantRole: "OWNER",
      tenantType: "RETAILER",
      permissions: ["prices.viewCost", "pricing.manage"],
      entitlements: { enforced: true, capabilities: { sellerMode: true } },
    } as never;
    const tpl = await settings.update(TENANT, OWNER, { validityDays: 15, accentColor: "#FF0055", theme: "bold", terms: "Pago contado" });
    expect(tpl).toMatchObject({ validityDays: 15, accentColor: "#ff0055", theme: "bold", terms: "Pago contado", businessName: "Presupuestos Integración" });
    await expect(settings.update(TENANT, OWNER, { accentColor: "rojo" })).rejects.toThrow("Color inválido");

    const quote = await service.create(ownerFull, { clientName: "Beto", clientEmail: "beto@cliente.test" });
    expect((new Date(quote.validUntil!).getTime() - Date.now()) / 86_400_000).toBeGreaterThan(14.9);
    await service.addItem(ownerFull, quote.id, { provider: "ELIT", externalId: "MON-24", qty: 1 });
    const withMargin = await service.updateClient(ownerFull, quote.id, { marginPercent: 10, discountPercent: 5, currency: "ARS" });
    expect(withMargin.items[0]).toMatchObject({ unitFinalPrice: 133.1, marginSource: "quote" });
    const custom = await service.addCustom(ownerFull, quote.id, { name: "Armado", unitFinalPrice: 12.1, currency: "USD" });
    expect(custom.subtotals).toEqual({ USD: 145.2 });
    expect(custom.totals).toEqual({ USD: 137.94 });
    const sent = await service.markSent(ownerFull, quote.id);
    expect(sent.status).toBe("SENT");

    const stored = await prisma.salesQuote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(Number(stored.marginPercent)).toBe(10);
    expect(Number(stored.discountPercent)).toBe(5);
    expect(stored).toMatchObject({ currency: "ARS", status: "SENT", clientEmail: "beto@cliente.test" });
    expect(JSON.stringify(stored.items)).not.toContain("121");
  });
  it("no pierde líneas con «Agregar», cantidades y quitar casi a la vez", async () => {
    const quote = await service.create(seller, { clientName: "Doble clic" });
    const ids = ["A", "B", "C", "D", "E", "F"];
    await Promise.all(ids.map((externalId) => service.addItem(seller, quote.id, { provider: "ELIT", externalId })));
    await Promise.all([1, 2].map(() => service.addItem(seller, quote.id, { provider: "ELIT", externalId: "A" })));
    let view = await service.get(seller, quote.id);
    expect(view.items.map((i) => i.externalId).sort()).toEqual(ids);
    expect(view.items.find((i) => i.externalId === "A")?.qty).toBe(3);
    const custom = Promise.all([0, 1, 2].map((n) => service.addCustom(seller, quote.id, { name: `Envío ${n}`, unitFinalPrice: 10, currency: "ARS" })));
    const qty = Promise.all([service.updateItem(seller, quote.id, 1, { qty: 4 }), service.updateItem(seller, quote.id, 2, { qty: 5 })]);
    await Promise.all([custom, qty]);
    view = await service.get(seller, quote.id);
    expect(view.items).toHaveLength(9);
    expect([view.items[1].qty, view.items[2].qty]).toEqual([4, 5]);
    const [refreshed] = await Promise.all([service.refreshPrices(seller, quote.id), service.addItem(seller, quote.id, { provider: "ELIT", externalId: "G" })]);
    view = await service.get(seller, quote.id);
    expect(view.items).toHaveLength(10);
    expect(refreshed.changes.filter((c) => c.after === null)).toEqual([]);
  });
});
