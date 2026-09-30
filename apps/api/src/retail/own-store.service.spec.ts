import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { TenantContext } from "../tenants/tenant-context.service";
import { OwnStoreService } from "./own-store.service";

function tenant(partial: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: "u1",
    tenantId: "t1",
    tenantName: "Local Uno",
    tenantType: "RETAILER",
    tenantRole: "OWNER",
    membershipId: "m1",
    permissions: ["providers.manage"],
    commercialTenantId: "t1",
    ...partial,
  };
}

const optionRow = {
  id: "store-1",
  name: "Gorila Games",
  logoUrl: null,
  syncedAt: new Date("2026-09-30T12:00:00.000Z"),
  active: true,
  _count: { products: 12 },
};

function makeService(prisma: Record<string, unknown>) {
  return new OwnStoreService(prisma as never);
}

describe("OwnStoreService", () => {
  it("un distribuidor no elige tienda propia", async () => {
    const service = makeService({});
    await expect(service.get(tenant({ tenantType: "DISTRIBUTOR", permissions: [] }))).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("quien no configura proveedores puede ver la tienda y no cambiarla", async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ ownRetailStore: optionRow }),
        update: jest.fn(),
      },
    };
    const service = makeService(prisma);
    const viewer = tenant({ tenantRole: "VIEWER", permissions: [] });
    const got = await service.get(viewer);
    expect(got.canEdit).toBe(false);
    expect(got.store?.name).toBe("Gorila Games");
    await expect(service.set(viewer, null)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("rechaza un local que no está sincronizado", async () => {
    const prisma = {
      retailStore: { findFirst: jest.fn().mockResolvedValue(null) },
      tenant: { update: jest.fn() },
    };
    const service = makeService(prisma);
    await expect(service.set(tenant(), "11111111-1111-4111-8111-111111111111")).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it("sin tienda elegida no busca precios", async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ ownRetailStore: null }) },
      retailProduct: { findMany: jest.fn() },
    };
    const service = makeService(prisma);
    const result = await service.quotes(tenant(), [{ key: "a", name: "Ryzen 5 7600" }]);
    expect(result).toEqual({ store: null, quotes: [] });
    expect(prisma.retailProduct.findMany).not.toHaveBeenCalled();
  });

  it("devuelve el precio de la tienda propia cuando el nombre coincide", async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          ownRetailStore: {
            id: "store-1",
            name: "Gorila Games",
            logoUrl: null,
            externalId: 5,
            priceDivisor: 1,
            active: true,
          },
        }),
      },
      retailProduct: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "p1",
            name: "Procesador AMD Ryzen 5 7600",
            searchText: "procesador amd ryzen 5 7600",
            price: 189990,
            productUrl: "https://gorila.example/7600",
            imageUrl: null,
            syncedAt: new Date("2026-09-30T12:00:00.000Z"),
            currency: "ARS",
          },
        ]),
      },
    };
    const service = makeService(prisma);
    const result = await service.quotes(tenant(), [{ key: "nb:1", name: "Procesador AMD Ryzen 5 7600" }]);
    expect(result.store?.id).toBe("store-1");
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]).toMatchObject({
      key: "nb:1",
      productId: "p1",
      price: 189990,
      confident: true,
    });
  });
});
