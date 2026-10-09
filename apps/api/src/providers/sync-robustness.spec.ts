import { Prisma } from "@prisma/client";
import { CatalogSyncAlreadyRunningError, interruptRunningCatalogSyncRuns, startCatalogSyncRun } from "./catalog-sync-progress";
import { ProvidersService } from "./providers.service";
import { SYNC_MAX_FAILURES } from "./sync-backoff";

function service(prisma: Record<string, unknown>) {
  const registry = { get: jest.fn().mockReturnValue({ provider: "ELIT" }) };
  return new ProvidersService(prisma as never, {} as never, registry as never, {} as never, {} as never);
}

describe("backoff y pausa del auto-sync", () => {
  function setup(after: { enabled: boolean; consecutiveFailures: number; pausedAt: Date | null }) {
    const prisma = {
      providerSyncConfig: {
        upsert: jest.fn().mockResolvedValue({ id: "cfg1", ...after }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orgNotification: { create: jest.fn().mockResolvedValue({}) },
    };
    return { svc: service(prisma), prisma };
  }

  it("cada fallo suma al contador y guarda el intento", async () => {
    const { svc, prisma } = setup({ enabled: true, consecutiveFailures: 2, pausedAt: null });
    await svc.recordSyncFailure("t1", "ELIT", new Error("Request failed with status code 403"));
    expect(prisma.providerSyncConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ consecutiveFailures: { increment: 1 }, lastAttemptAt: expect.any(Date) }),
      })
    );
    expect(prisma.providerSyncConfig.updateMany).not.toHaveBeenCalled();
    expect(prisma.orgNotification.create).not.toHaveBeenCalled();
  });

  it("al llegar al tope pausa el auto-sync y avisa al comercio en criollo", async () => {
    const { svc, prisma } = setup({ enabled: true, consecutiveFailures: SYNC_MAX_FAILURES, pausedAt: null });
    await svc.recordSyncFailure("t1", "ELIT", new Error("Request failed with status code 403"));
    expect(prisma.providerSyncConfig.updateMany).toHaveBeenCalledWith({
      where: { id: "cfg1", pausedAt: null },
      data: { pausedAt: expect.any(Date), pauseReason: expect.stringMatching(/403/) },
    });
    const notif = prisma.orgNotification.create.mock.calls[0][0].data;
    expect(notif).toMatchObject({ toTenantId: "t1", kind: "SYSTEM", landingKey: "sync-paused:ELIT" });
    expect(notif.title).toMatch(/Sync pausado por error de/);
    expect(notif.body).toMatch(/no se reintenta sola/);
  });

  it("ya pausado o sin auto-sync no vuelve a avisar", async () => {
    const paused = setup({ enabled: true, consecutiveFailures: 9, pausedAt: new Date() });
    await paused.svc.recordSyncFailure("t1", "ELIT", new Error("x"));
    expect(paused.prisma.orgNotification.create).not.toHaveBeenCalled();
    const manual = setup({ enabled: false, consecutiveFailures: 9, pausedAt: null });
    await manual.svc.recordSyncFailure("t1", "ELIT", new Error("x"));
    expect(manual.prisma.orgNotification.create).not.toHaveBeenCalled();
  });

  it("el cron no cuenta dos veces un fallo que ya registró la corrida, ni el 'ya hay una en curso'", async () => {
    const { svc, prisma } = setup({ enabled: true, consecutiveFailures: 1, pausedAt: null });
    const err = new Error("portal caído");
    await svc.recordSyncFailure("t1", "ELIT", err);
    await svc.noteCronFailure("t1", "ELIT", err);
    await svc.noteCronFailure("t1", "ELIT", new Error("Ya hay una sincronización en curso para este proveedor"));
    expect(prisma.providerSyncConfig.upsert).toHaveBeenCalledTimes(1);
    await svc.noteCronFailure("t1", "ELIT", new Error("No hay credenciales guardadas para ELIT"));
    expect(prisma.providerSyncConfig.upsert).toHaveBeenCalledTimes(2);
  });
});

describe("precio que deja de llegar (sync por API)", () => {
  function setup(previous: { price: number | null; finalPrice: number | null } | null) {
    const prisma = {
      tenantProductOffer: {
        findMany: jest.fn().mockResolvedValue(previous ? [{ externalId: "A1", ...previous, currency: "USD", ivaPercent: 21, stock: 3, stockStatus: null, source: "SYNC" }] : []),
        upsert: jest.fn().mockResolvedValue({}),
      },
      providerSyncCache: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
      productPriceHistory: { createMany: jest.fn().mockResolvedValue({}) },
    };
    return { svc: service(prisma), prisma };
  }
  const upsertPage = (svc: ProvidersService, items: unknown[], stats: { lostPrice: number }) =>
    (svc as unknown as { upsertPage: (...a: unknown[]) => Promise<unknown> }).upsertPage("t1", "ELIT", items, undefined, "SYNC", stats);

  it("si el proveedor manda el producto sin precio, no se conserva el precio viejo", async () => {
    const { svc, prisma } = setup({ price: 10, finalPrice: 12.1 });
    const stats = { lostPrice: 0 };
    await upsertPage(svc, [{ externalId: "A1", name: "Mouse", stock: 3, raw: {} }], stats);
    const update = prisma.tenantProductOffer.upsert.mock.calls[0][0].update;
    expect(update).toMatchObject({ price: null, finalPrice: null, needsResync: true });
    expect(stats.lostPrice).toBe(1);
  });

  it("con precio, se actualiza normal y no toca `active` (se reactiva al terminar la corrida)", async () => {
    const { svc, prisma } = setup({ price: 10, finalPrice: 12.1 });
    const stats = { lostPrice: 0 };
    await upsertPage(svc, [{ externalId: "A1", name: "Mouse", price: 11, stock: 3, raw: {} }], stats);
    const call = prisma.tenantProductOffer.upsert.mock.calls[0][0];
    expect(call.update).toMatchObject({ price: 11, needsResync: false });
    expect(call.update).not.toHaveProperty("active");
    expect(call.create).toMatchObject({ active: true });
    expect(stats.lostPrice).toBe(0);
  });
});

describe("concurrencia de corridas", () => {
  it("si otra corrida ganó la carrera (índice único), responde 'ya hay una en curso'", async () => {
    const prisma = {
      catalogSyncRun: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5" })),
      },
    };
    await expect(
      startCatalogSyncRun(prisma as never, { tenantId: "t1", provider: "ELIT", source: "cron", expectedTotal: 0 })
    ).rejects.toBeInstanceOf(CatalogSyncAlreadyRunningError);
  });

  it("al arrancar solo cierra corridas sin latido reciente", async () => {
    const prisma = { catalogSyncRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await interruptRunningCatalogSyncRuns(prisma as never, { olderThanMs: 30_000 });
    const where = prisma.catalogSyncRun.updateMany.mock.calls[0][0].where;
    expect(where.status).toBe("RUNNING");
    expect(where.heartbeatAt.lt.getTime()).toBeLessThanOrEqual(Date.now() - 30_000 + 50);
  });
});
