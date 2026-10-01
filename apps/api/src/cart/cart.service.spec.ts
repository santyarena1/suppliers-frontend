import { NotFoundException } from "@nestjs/common";
import { CartService, canWatchClientCart, onlyProvider } from "./cart.service";

const CART = {
  items: [
    { provider: "LIST_NORTE", externalId: "A", qty: 1 },
    { provider: "ELIT", externalId: "B", qty: 2 },
    { externalId: "sin-proveedor", qty: 1 },
  ],
  schemes: [
    { id: "s1", name: "Norte", provider: "LIST_NORTE" },
    { id: "s2", name: "Elit", provider: "ELIT" },
  ],
  updatedByUserId: "u-retail",
  updatedAt: new Date("2026-10-01T10:00:00Z"),
};

function distributor(role: string, userId = "u-dist") {
  return { tenantId: "t-dist", tenantType: "DISTRIBUTOR", tenantRole: role, userId } as never;
}

function setup(link: Record<string, unknown> | null, supplierMembers: Record<string, unknown>[] = []) {
  const prisma = {
    tenantLink: {
      findUnique: jest.fn().mockResolvedValue(link),
      findMany: jest.fn().mockResolvedValue([
        { supplierTenantId: "t-dist", accountManagerId: "u-seller", supplierTenant: { providerKey: "LIST_NORTE" } },
      ]),
    },
    orgCart: { findUnique: jest.fn().mockResolvedValue(CART), upsert: jest.fn().mockResolvedValue(CART) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ providerKey: "LIST_NORTE" }) },
    tenantMembership: {
      findMany: jest
        .fn()
        // 1ª: equipo del comercio · 2ª: equipo de los distribuidores vinculados.
        .mockResolvedValueOnce([{ userId: "u-retail" }])
        .mockResolvedValueOnce(supplierMembers),
    },
  };
  const hub = { emitToUsers: jest.fn() };
  return { service: new CartService(prisma as never, hub as never), prisma, hub };
}

const ACTIVE_LINK = { id: "l1", supplierTenantId: "t-dist", clientTenantId: "t-retail", accountManagerId: "u-seller", status: "ACTIVE" };

describe("carrito del cliente visto por el distribuidor", () => {
  it("solo trae los productos y esquemas de su lista", async () => {
    const { service } = setup(ACTIVE_LINK);
    const cart = await service.getClientCart(distributor("OWNER"), "l1");
    expect(cart.items).toEqual([{ provider: "LIST_NORTE", externalId: "A", qty: 1 }]);
    expect(cart.schemes).toEqual([{ id: "s1", name: "Norte", provider: "LIST_NORTE" }]);
  });

  it.each(["SUSPENDED", "REVOKED", "PENDING"])("con el vínculo %s no lo ve", async (status) => {
    const { service } = setup({ ...ACTIVE_LINK, status });
    await expect(service.getClientCart(distributor("OWNER"), "l1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("un cliente de otro distribuidor no existe", async () => {
    const { service } = setup({ ...ACTIVE_LINK, supplierTenantId: "t-otro" });
    await expect(service.getClientCart(distributor("OWNER"), "l1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("un vendedor solo ve los clientes que tiene asignados", async () => {
    const { service } = setup(ACTIVE_LINK);
    await expect(service.getClientCart(distributor("SELLER", "u-otro"), "l1")).rejects.toBeInstanceOf(NotFoundException);
    const { service: own } = setup(ACTIVE_LINK);
    await expect(own.getClientCart(distributor("SELLER", "u-seller"), "l1")).resolves.toBeTruthy();
  });

  it("otros roles del distribuidor (p. ej. product manager) no lo ven", () => {
    expect(canWatchClientCart({ tenantRole: "PRODUCT_MANAGER", userId: "u-seller" } as never, "u-seller")).toBe(false);
    expect(canWatchClientCart({ tenantRole: "ADMIN", userId: "x" } as never, null)).toBe(true);
  });

  it("un distribuidor sin proveedor asignado ve el carrito vacío", () => {
    const cart = onlyProvider({ tenantId: "t", items: CART.items, schemes: CART.schemes, updatedByUserId: null, updatedAt: null }, null);
    expect(cart.items).toEqual([]);
    expect(cart.schemes).toEqual([]);
  });
});

describe("aviso en vivo al guardar el carrito", () => {
  const retailer = { tenantId: "t-retail", tenantType: "RETAILER", tenantRole: "OWNER", userId: "u-retail" } as never;

  it("el comercio recibe todo; el distribuidor solo lo suyo y solo a dueño/admin y vendedor activo", async () => {
    const { service, hub } = setup(null, [
      { userId: "u-owner", tenantId: "t-dist", role: "OWNER" },
      { userId: "u-seller", tenantId: "t-dist", role: "SELLER" },
      { userId: "u-pm", tenantId: "t-dist", role: "PRODUCT_MANAGER" },
    ]);
    await service.putOrgCart(retailer, "u-retail", { items: CART.items, schemes: CART.schemes } as never);
    const [team, dist] = hub.emitToUsers.mock.calls;
    expect(team[0]).toEqual(["u-retail"]);
    expect(team[1].data.items).toHaveLength(3);
    expect(dist[0].sort()).toEqual(["u-owner", "u-seller"]);
    expect(dist[1].data.items).toEqual([{ provider: "LIST_NORTE", externalId: "A", qty: 1 }]);
  });

  it("un vendedor asignado que ya no está en el equipo no recibe nada", async () => {
    const { service, hub } = setup(null, [{ userId: "u-owner", tenantId: "t-dist", role: "OWNER" }]);
    await service.putOrgCart(retailer, "u-retail", { items: CART.items, schemes: CART.schemes } as never);
    expect(hub.emitToUsers.mock.calls[1][0]).toEqual(["u-owner"]);
  });
});
