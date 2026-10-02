import { ListImportService } from "./list-import.service";

const BASE_RECORD = {
  id: "imp-1",
  provider: "LIST_SENTEY",
  level: "BASE",
  status: "NEEDS_REVIEW",
  tenantId: "sup",
  normalizedRows: [{ externalId: "a1", name: "Producto A", price: 10 }],
  diff: { missingIds: ["gone-1", "gone-2"] },
  summary: null,
  profileId: null,
  snapshot: null,
  createdAt: new Date(),
  appliedAt: null,
  revertedAt: null,
  issues: [],
  tenant: { name: "Sentey" },
};

function setup(opts: { applyFails?: boolean } = {}) {
  const prisma = {
    supplierListImport: {
      findUnique: jest.fn().mockResolvedValue(BASE_RECORD),
      update: jest.fn().mockResolvedValue({}),
    },
    supplierBaseOffer: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    tenantProductOffer: {
      updateMany: jest.fn().mockResolvedValue({ count: 4 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "sup" }),
      findUnique: jest.fn().mockResolvedValue({ id: "sup" }),
    },
    tenantLink: { findMany: jest.fn().mockResolvedValue([{ clientTenantId: "shop-1" }]) },
    importProfile: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const providers = {
    applyListOffers: jest.fn().mockImplementation(async () => {
      if (opts.applyFails) throw new Error("se cortó la base");
      return {};
    }),
    materializeBaseOffers: jest.fn().mockResolvedValue(null),
  };
  const catalog = {
    autoAssignKnownBrands: jest.fn().mockResolvedValue({ assigned: 0, byBrand: {} }),
    autoCompleteWithAi: jest.fn().mockResolvedValue({ completed: 0, considered: 0, usedAi: false }),
  };
  const service = new ListImportService(prisma as never, providers as never, {} as never, {} as never, {} as never, catalog as never);
  return { service, prisma, providers };
}

describe("aplicar la lista base", () => {
  it("lo que ya no viene deja de mostrarse en el distribuidor y en todos sus clientes (solo BASE_LIST)", async () => {
    const { service, prisma, providers } = setup();
    await service.applyImport("imp-1", null);
    expect(prisma.supplierBaseOffer.deleteMany).toHaveBeenCalledWith({
      where: { provider: "LIST_SENTEY", externalId: { in: ["gone-1", "gone-2"] } },
    });
    expect(prisma.tenantProductOffer.updateMany).toHaveBeenCalledWith({
      where: { provider: "LIST_SENTEY", source: "BASE_LIST", externalId: { in: ["gone-1", "gone-2"] }, active: true },
      data: { active: false },
    });
    // Se vuelve a materializar en cada cliente vinculado.
    expect(providers.materializeBaseOffers).toHaveBeenCalledWith("shop-1", "LIST_SENTEY");
    const applied = prisma.supplierListImport.update.mock.calls.length;
    expect(applied).toBeGreaterThan(0);
  });

  it("si falla a mitad, restaura la lista anterior y queda FAILED con un mensaje claro", async () => {
    const { service, prisma } = setup({ applyFails: true });
    await expect(service.applyImport("imp-1", null)).rejects.toThrow("se cortó la base");
    // Restaurar: la base vuelve a la foto previa (vacía en este caso).
    expect(prisma.$transaction).toHaveBeenCalled();
    const last = prisma.supplierListImport.update.mock.calls.at(-1)?.[0];
    expect(last.data.status).toBe("FAILED");
    expect(last.data.error).toContain("No se cambió nada");
    expect(last.data.error).toContain("se cortó la base");
  });
});
