// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test).
import { PrismaClient } from "@prisma/client";
import { addDays } from "@nodo/shared";
import { searchLimitError } from "../tenants/entitlements";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import { SubscriptionRemindersService } from "./subscription-reminders.service";
import { SubscriptionsService } from "./subscriptions.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;

const RETAILER = "sub-int-retailer";
const ADMIN = "sub-int-admin";
const DISTROS = Array.from({ length: 7 }, (_, i) => ({ id: `sub-int-d${i + 1}`, key: `LIST_SUBINT_${i + 1}`, name: `Distro Int ${i + 1}` }));
/** Vinculado pero sin precios: primero por nombre, así si contara le sacaría el lugar a otro. */
const UNPRICED = { id: "sub-int-d0", key: "LIST_SUBINT_0", name: "Distro Int 0" };
const ALL_IDS = [RETAILER, UNPRICED.id, ...DISTROS.map((x) => x.id)];
const ALL_KEYS = [UNPRICED.key, ...DISTROS.map((x) => x.key)];

d("Suscripciones contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const visibility = new TenantVisibilityService(prisma as never);
  const service = new SubscriptionsService(prisma as never, visibility);
  const cron = new SubscriptionRemindersService(prisma as never);
  const actor = { userId: ADMIN };

  const activeInSearch = async () => (await visibility.listFor(RETAILER)).filter((v) => v.inSearch).map((v) => v.provider);
  const linkCount = () => prisma.tenantLink.count({ where: { clientTenantId: RETAILER } });

  beforeAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: ALL_IDS } } });
    await prisma.providerSyncCache.deleteMany({ where: { provider: { in: ALL_KEYS } } });
    await prisma.user.upsert({
      where: { id: ADMIN },
      create: { id: ADMIN, username: "sub-int-admin", email: "sub-int-admin@nodo.test", passwordHash: "x", role: "ROLE_ADMIN" },
      update: {},
    });
    await prisma.tenant.create({ data: { id: RETAILER, name: "Comercio Suscripción Int", type: "RETAILER", plan: "BASE" } });
    for (const x of DISTROS) {
      await prisma.tenant.create({ data: { id: x.id, name: x.name, type: "DISTRIBUTOR", providerKey: x.key } });
      await prisma.tenantLink.create({ data: { clientTenantId: RETAILER, supplierTenantId: x.id, status: "ACTIVE" } });
      await prisma.providerSyncCache.create({ data: { provider: x.key, externalId: "p1", name: `Producto ${x.name}`, raw: {} } });
      await prisma.tenantProductOffer.create({ data: { tenantId: RETAILER, provider: x.key, externalId: "p1", price: 10 } });
    }
    await prisma.tenant.create({ data: { id: UNPRICED.id, name: UNPRICED.name, type: "DISTRIBUTOR", providerKey: UNPRICED.key } });
    await prisma.tenantLink.create({ data: { clientTenantId: RETAILER, supplierTenantId: UNPRICED.id, status: "ACTIVE" } });
    await service.ensure(RETAILER);
    await prisma.subscription.update({
      where: { tenantId: RETAILER },
      data: { status: "ACTIVE", nextBillingAt: addDays(new Date(), 20), currentPeriodEnd: addDays(new Date(), 20) },
    });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: ALL_IDS } } });
    await prisma.providerSyncCache.deleteMany({ where: { provider: { in: ALL_KEYS } } });
    await prisma.auditLogEntry.deleteMany({ where: { performedById: ADMIN } });
    await prisma.user.deleteMany({ where: { id: ADMIN } });
    await prisma.$disconnect();
  });

  it("Base: 7 conectados, 5 activos en búsqueda", async () => {
    const usage = await visibility.searchUsage(RETAILER);
    expect(usage).toEqual({ connectedProviders: 7, activeSearchProviders: 5, maxSearchProviders: 5 });
  });

  it("un proveedor vinculado sin precios no busca, no cuenta y no le saca el lugar a nadie", async () => {
    const row = (await visibility.listFor(RETAILER)).find((v) => v.provider === UNPRICED.key)!;
    expect(row).toMatchObject({ linked: true, configured: false, inSearch: false });
    expect(await activeInSearch()).not.toContain(UNPRICED.key);
  });

  it("prender un 6º responde PLAN_SEARCH_LIMIT y no toca nada", async () => {
    const off = (await visibility.listFor(RETAILER)).find((v) => !v.inSearch && v.configured)!;
    await expect(visibility.setIncludeInSearch(RETAILER, off.provider, true, { onLimit: searchLimitError })).rejects.toMatchObject({
      response: { code: "PLAN_SEARCH_LIMIT" },
    });
    expect(await linkCount()).toBe(8);
  });

  it("apagar uno libera el lugar para otro", async () => {
    const [first] = await activeInSearch();
    const off = (await visibility.listFor(RETAILER)).find((v) => !v.inSearch && v.configured)!;
    await visibility.setIncludeInSearch(RETAILER, first, false, { onLimit: searchLimitError });
    const result = await visibility.setIncludeInSearch(RETAILER, off.provider, true, { onLimit: searchLimitError });
    expect(result.inSearch).toBe(true);
    expect(result.activeSearchProviders).toBe(5);
    expect(await activeInSearch()).not.toContain(first);
  });

  it("Pro busca en todos; volver a Base deja 5 y no desconecta ninguno", async () => {
    await service.changePlan(actor, RETAILER, { plan: "PRO" });
    expect(await activeInSearch()).toHaveLength(7);
    await service.changePlan(actor, RETAILER, { plan: "BASE" });
    expect(await activeInSearch()).toHaveLength(5);
    expect(await linkCount()).toBe(8);
    const audit = await prisma.auditLogEntry.count({ where: { entityId: RETAILER, action: "SUBSCRIPTION_PLAN_CHANGED" } });
    expect(audit).toBe(2);
  });

  it("Custom deja la puesta en marcha pendiente", async () => {
    const detail = await service.changePlan(actor, RETAILER, { plan: "CUSTOM" });
    expect(detail.setupFee).toMatchObject({ status: "PENDING", amount: 300 });
    const paid = await service.registerPayment(actor, RETAILER, { kind: "SETUP_FEE" });
    expect(paid.setupFee.status).toBe("PAID");
    await service.changePlan(actor, RETAILER, { plan: "PRO" });
  });

  it("vencida la gracia el cron la suspende, avisa una sola vez y no borra nada", async () => {
    const due = addDays(new Date(), -10);
    await prisma.subscription.update({ where: { tenantId: RETAILER }, data: { status: "ACTIVE", nextBillingAt: due, currentPeriodEnd: due } });
    await cron.run();
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { tenantId: RETAILER } });
    expect(sub).toMatchObject({ status: "SUSPENDED", suspensionReason: "OVERDUE" });
    const reminders = await prisma.subscriptionReminder.findMany({ where: { tenantId: RETAILER } });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ kind: "SUSPENDED", status: "SENT" });
    await cron.run();
    expect(await prisma.subscriptionReminder.count({ where: { tenantId: RETAILER } })).toBe(1);
    expect(await prisma.orgNotification.count({ where: { toTenantId: RETAILER, landingKey: "subscription:SUSPENDED" } })).toBe(1);
    expect(await linkCount()).toBe(8);
  });

  it("registrar el pago reactiva al instante", async () => {
    const detail = await service.registerPayment(actor, RETAILER, { provider: "TRANSFER", externalReference: "TRF-INT-1" });
    expect(detail).toMatchObject({ status: "ACTIVE", access: "FULL" });
    expect(new Date(detail.currentPeriodEnd!).getTime()).toBeGreaterThan(Date.now());
    expect(detail.payments[0]).toMatchObject({ amount: 60, provider: "TRANSFER" });
    await expect(
      service.registerPayment(actor, RETAILER, { provider: "TRANSFER", externalReference: "TRF-INT-1" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("suspensión manual y reactivación", async () => {
    expect((await service.suspend(actor, RETAILER, "prueba")).status).toBe("SUSPENDED");
    expect((await service.reactivate(actor, RETAILER)).status).toBe("ACTIVE");
  });

  it("cortesía Pro con fecha y conversión a suscripción normal", async () => {
    const until = addDays(new Date(), 30);
    const detail = await service.setCourtesy(actor, RETAILER, { plan: "PRO", until: until.toISOString(), reason: "Piloto" });
    expect(detail).toMatchObject({ status: "COURTESY", plan: "PRO", courtesy: { active: true, reason: "Piloto" } });
    const converted = await service.endCourtesy(actor, RETAILER, { mode: "CONVERT" });
    expect(converted.status).toBe("ACTIVE");
    expect(converted.nextBillingAt).toBe(until.toISOString());
  });

  it("filtros del panel", async () => {
    const { counts, rows } = await service.adminList("active", "Suscripción Int");
    expect(rows.map((r) => r.tenantId)).toContain(RETAILER);
    expect(counts.all).toBeGreaterThanOrEqual(1);
  });
});
