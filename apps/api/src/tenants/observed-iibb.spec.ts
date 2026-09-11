import { BadRequestException } from "@nestjs/common";
import { TenantVisibilityService } from "./tenant-visibility.service";

/** Prisma mínimo: solo el upsert que toca este caso. */
function prismaFalso() {
  const upsert = jest.fn(async ({ update }: { update: Record<string, unknown> }) => ({
    provider: "NEW_BYTES",
    priceChannel: "API",
    manualIibbPercent: null,
    manualPerceptionsPercent: null,
    learnedIibbPercent: update.learnedIibbPercent,
    learnedIibbAt: update.learnedIibbAt,
    acceptsOffline: false,
    acceptsScheme: false,
    offlineIvaAdjustment: null,
    schemeIvaAdjustment: null,
    schemeDiscountPercent: null,
  }));
  return { prisma: { providerSyncConfig: { upsert } }, upsert };
}

function servicio() {
  const { prisma, upsert } = prismaFalso();
  // El servicio solo usa this.prisma; alcanza con inyectar el doble.
  return { svc: new TenantVisibilityService(prisma as never), upsert };
}

describe("recordObservedIibb", () => {
  it("guarda la percepción que cotizó el portal y la devuelve", async () => {
    const { svc, upsert } = servicio();

    const purchase = await svc.recordObservedIibb("t1", "NEW_BYTES", 3);

    expect(purchase.learnedIibbPercent).toBe(3);
    expect(purchase.learnedIibbAt).toEqual(expect.any(String));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_provider: { tenantId: "t1", provider: "NEW_BYTES" } },
      }),
    );
  });

  it("redondea a dos decimales, que es lo que entra en la columna", async () => {
    const { svc } = servicio();
    const purchase = await svc.recordObservedIibb("t1", "NEW_BYTES", 3.14159);
    expect(purchase.learnedIibbPercent).toBe(3.14);
  });

  it("acepta 0: es el portal diciendo que no cobra percepción", async () => {
    const { svc } = servicio();
    const purchase = await svc.recordObservedIibb("t1", "NEW_BYTES", 0);
    expect(purchase.learnedIibbPercent).toBe(0);
  });

  it("rechaza porcentajes imposibles en vez de guardar basura", async () => {
    const { svc } = servicio();
    await expect(svc.recordObservedIibb("t1", "NEW_BYTES", -1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.recordObservedIibb("t1", "NEW_BYTES", 150)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.recordObservedIibb("t1", "NEW_BYTES", Number.NaN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
