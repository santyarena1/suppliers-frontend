// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
import { PrismaClient } from "@prisma/client";
import { hashSecret } from "./auth/api-key-crypto";
import { ApiClientResolver } from "./auth/api-client-resolver.service";
import { ChangeTrackerService } from "./changes/change-tracker.service";
import { ChangesFeedService } from "./changes/changes-feed.service";
import { CatalogQueryService } from "./core/catalog-query.service";
import { CatalogSnapshotService } from "./core/catalog-snapshot.service";
import { WebhooksService } from "./webhooks/webhooks.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;
const TENANT = "capi-int-tenant";
const KEY = "nodo_pk_CAPIINTEGRATION0001";
const SECRET = "nodo_sk_capi_integration_secret";
const PROVIDER = "ELIT";

d("API de catálogo contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  // Lo que no es de este módulo se reemplaza por lo mínimo: un distribuidor vinculado y visible.
  const providers = { rulesByProvider: async () => new Map([[PROVIDER, { markupPercent: 20, minStockThreshold: 0, zeroStockAction: "KEEP" }]]), providersHidingUnsynced: async () => new Set<string>() };
  const visibility = { listFor: async () => [{ provider: PROVIDER, name: "Elit", linked: true, platformHidden: false }] };
  const enrichment = { getContext: async () => undefined };
  const fx = { forKey: async () => ({ source: "oficial", rate: 1000, at: null, stale: false }), snapshot: async () => ({ rates: {}, at: null, stale: false }) };
  const snapshots = new CatalogSnapshotService(prisma as never, providers as never, visibility as never, enrichment as never);
  const query = new CatalogQueryService(snapshots, fx as never);
  const resolver = new ApiClientResolver(prisma as never);
  const tracker = new ChangeTrackerService(prisma as never, snapshots);
  const changes = new ChangesFeedService(prisma as never, query);
  const webhooks = new WebhooksService(prisma as never, { encrypt: (s: string) => s, decrypt: (s: string) => s } as never, resolver, changes);

  async function cleanup() {
    await prisma.apiCatalogEvent.deleteMany({ where: { tenantId: TENANT } });
    await prisma.apiOfferState.deleteMany({ where: { tenantId: TENANT } });
    await prisma.apiCatalogTracker.deleteMany({ where: { tenantId: TENANT } });
    await prisma.apiClient.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenantProductOffer.deleteMany({ where: { tenantId: TENANT } });
    await prisma.providerSyncCache.deleteMany({ where: { provider: PROVIDER, externalId: { startsWith: "capi-int-" } } });
    await prisma.subscription.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
  }

  beforeAll(async () => {
    await cleanup();
    await prisma.tenant.create({ data: { id: TENANT, name: "CAPI Integración", type: "RETAILER", plan: "BASE" } });
    await prisma.subscription.create({
      data: { tenantId: TENANT, status: "ACTIVE", catalogApiAddon: true, nextBillingAt: new Date(Date.now() + 10 * 86_400_000) },
    });
    for (const [id, price, stock] of [["capi-int-1", 100, 5], ["capi-int-2", 50, 3]] as const) {
      await prisma.providerSyncCache.create({ data: { provider: PROVIDER, externalId: id, name: `Producto ${id}`, brand: "ASUS", raw: { iva: 21 } } });
      await prisma.tenantProductOffer.create({ data: { tenantId: TENANT, provider: PROVIDER, externalId: id, price, ivaPercent: 21, stock, currency: "USD" } });
    }
    await prisma.apiClient.create({
      data: {
        tenantId: TENANT,
        name: "Integración",
        publicKey: KEY,
        secretHash: hashSecret(SECRET),
        secretLast4: SECRET.slice(-4),
        feedToken: "nodo_ft_CAPIINTEGRATION00000000001",
        config: {},
        scopes: ["catalog:read", "changes:read"],
        ipAllowlist: [],
        createdById: "test",
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("key → productos con precio de venta con el margen del comercio", async () => {
    const principal = await resolver.byCredentials(KEY, SECRET, "1.1.1.1", "catalog:read");
    const page = await query.listProducts(principal, { sort: "name" });
    expect(page.data.map((p) => p.name)).toEqual(["Producto capi-int-1", "Producto capi-int-2"]);
    expect(page.data[0].bestOffer?.price).toMatchObject({ cost: { net: 100, gross: 121 }, sale: { net: 120, gross: 145.2 } });
  });

  it("cambios: la foto inicial no genera eventos; un cambio de precio y una baja, sí", async () => {
    const principal = await resolver.byCredentials(KEY, SECRET, "1.1.1.1", "changes:read");
    const start = await changes.page(principal, undefined, 100);
    await tracker.track(TENANT);
    expect(await prisma.apiCatalogEvent.count({ where: { tenantId: TENANT } })).toBe(0);

    await prisma.tenantProductOffer.update({
      where: { tenantId_provider_externalId: { tenantId: TENANT, provider: PROVIDER, externalId: "capi-int-1" } },
      data: { price: 90 },
    });
    await prisma.tenantProductOffer.delete({
      where: { tenantId_provider_externalId: { tenantId: TENANT, provider: PROVIDER, externalId: "capi-int-2" } },
    });
    await prisma.apiCatalogTracker.update({ where: { tenantId: TENANT }, data: { lastFullScanAt: null } });
    await tracker.track(TENANT);

    const page = await changes.page(principal, start.pagination.nextCursor, 100);
    const byType = Object.fromEntries(page.data.map((c) => [c.type, c]));
    expect(byType["offer.updated"]).toMatchObject({ changed: ["price"] });
    expect(byType["offer.updated"].offer?.price?.cost?.net).toBe(90);
    expect(byType["offer.removed"]).toBeDefined();

    // Repetir la pasada no duplica nada.
    await tracker.track(TENANT);
    const again = await changes.page(principal, page.pagination.nextCursor, 100);
    expect(again.data).toHaveLength(0);
  });

  it("webhooks: se encolan los cambios desde el cursor y el cursor avanza", async () => {
    const client = await prisma.apiClient.findUniqueOrThrow({ where: { publicKey: KEY } });
    const endpoint = await prisma.apiWebhookEndpoint.create({
      data: { apiClientId: client.id, url: "https://ejemplo.com/hook", secretEncrypted: "whsec_x", events: ["price.changed", "offer.removed"], cursor: 0n },
    });
    const queued = await webhooks.enqueue(endpoint);
    expect(queued).toBe(1);
    const delivery = await prisma.apiWebhookDelivery.findFirstOrThrow({ where: { endpointId: endpoint.id } });
    const items = (delivery.payload as { data: { items: { type: string; events: string[] }[] } }).data.items;
    expect(items.map((i) => i.type).sort()).toEqual(["offer.removed", "offer.updated"]);
    const after = await prisma.apiWebhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(after.cursor).toBeGreaterThan(0n);
    expect(await webhooks.enqueue(after)).toBe(0);
  });
});
