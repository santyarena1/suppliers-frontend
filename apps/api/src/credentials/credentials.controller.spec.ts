import { ForbiddenException } from "@nestjs/common";
import { resolvePermissions, type TenantRole } from "@nodo/shared";
import { CredentialsController } from "./credentials.controller";

function tenant(role: TenantRole) {
  return {
    userId: "u1",
    tenantId: "t1",
    tenantName: "Local Uno",
    tenantType: "RETAILER" as const,
    tenantRole: role,
    membershipId: "m1",
    permissions: resolvePermissions({ type: "RETAILER", role }),
    commercialTenantId: "t1",
  };
}

function makeController() {
  const service = {
    ofTenant: jest.fn().mockResolvedValue([{ providerName: "ELIT", credentialsJson: '{"user":"a","password":"secreta"}' }]),
    getByProvider: jest.fn().mockResolvedValue({ providerName: "ELIT", credentialsJson: "{}" }),
    save: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
  return { controller: new CredentialsController(service as never), service };
}

describe("CredentialsController · permisos", () => {
  it("quien configura proveedores ve las credenciales", async () => {
    const { controller } = makeController();
    const rows = await controller.mine(tenant("ADMIN"));
    expect(rows[0].credentialsJson).toContain("secreta");
  });

  it("el resto ve qué proveedores hay, sin las contraseñas", async () => {
    const { controller } = makeController();
    const rows = await controller.mine(tenant("SELLER"));
    expect(rows).toEqual([{ providerName: "ELIT", credentialsJson: null }]);
  });

  it("sin permiso no puede leer, guardar ni borrar una credencial", async () => {
    const { controller, service } = makeController();
    const viewer = tenant("VIEWER");
    await expect(controller.getByProvider(viewer, "ELIT")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.save(viewer, { userId: "u1" } as never, {} as never)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.delete(viewer, "ELIT")).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.save).not.toHaveBeenCalled();
    expect(service.delete).not.toHaveBeenCalled();
  });
});
