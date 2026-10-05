// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
import { PrismaClient } from "@prisma/client";
import { saleRuleKey } from "@nodo/shared";
import { SaleMarginRulesService } from "../pricing/sale-margin-rules.service";
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
    getProduct: async (_t: string, provider: string, externalId: string) => ({
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
  const service = new QuotesService(prisma as never, providers as never, rules);
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

    const ownerList = await service.list(owner);
    expect(ownerList.find((q) => q.id === quote.id)).toMatchObject({ initials: "AG", createdByName: "q-int-vendedor", mine: false });
    expect((await service.list(owner, { q: "ana" })).map((q) => q.id)).toEqual([quote.id]);
    expect((await service.list(owner, { q: `#${quote.number}` })).map((q) => q.id)).toEqual([quote.id]);

    await service.setArchived(seller, quote.id, true);
    expect((await service.list(seller)).some((q) => q.id === quote.id)).toBe(false);
    expect((await service.list(seller, { archived: true })).map((q) => q.id)).toEqual([quote.id]);
  });
});
