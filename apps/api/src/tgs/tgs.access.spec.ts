import { ForbiddenException } from "@nestjs/common";
import { TgsAccessService } from "./tgs.access";
import type { TenantContext } from "../tenants/tenant-context.service";

function tenant(id: string): TenantContext {
  return {
    userId: "u",
    tenantId: id,
    tenantName: "Local",
    tenantType: "RETAILER",
    tenantRole: "OWNER",
    commercialTenantId: id,
  };
}

describe("TgsAccessService", () => {
  const prisma = {
    user: { findUnique: jest.fn() },
  };
  const config = { get: jest.fn() };

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    config.get.mockReset();
  });

  function service() {
    return new TgsAccessService(prisma as never, config as never);
  }

  it("deja pasar solo al tenant de testuser1", async () => {
    config.get.mockReturnValue(undefined);
    prisma.user.findUnique.mockResolvedValue({ memberships: [{ tenantId: "tgs-org" }] });
    const access = service();
    await expect(access.isAllowed(tenant("tgs-org"))).resolves.toBe(true);
    await expect(access.isAllowed(tenant("otra"))).resolves.toBe(false);
    await expect(access.assertAllowed(tenant("otra"))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("sin usuario de prueba, nadie entra", async () => {
    config.get.mockReturnValue(undefined);
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service().isAllowed(tenant("x"))).resolves.toBe(false);
  });

  it("TGS_ALLOWED_TENANT_ID pisa el lookup", async () => {
    config.get.mockImplementation((key: string) => (key === "TGS_ALLOWED_TENANT_ID" ? "fixed-id" : undefined));
    const access = service();
    await expect(access.isAllowed(tenant("fixed-id"))).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
