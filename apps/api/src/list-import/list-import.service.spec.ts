import { ListImportService, keyColumnsPresent } from "./list-import.service";
import type { ImportProfileSpec } from "./types";
import type { TenantContext } from "../tenants/tenant-context.service";

const SUPPLIER = { id: "sup-1", name: "Acme", active: true };

function service(overrides: { isLinked?: boolean; supplier?: typeof SUPPLIER | null; hasAdapter?: boolean } = {}) {
  const prisma = { tenant: { findUnique: jest.fn().mockResolvedValue(overrides.supplier === undefined ? SUPPLIER : overrides.supplier) } };
  const registry = { get: jest.fn().mockReturnValue(overrides.hasAdapter ? {} : undefined) };
  const visibility = { isLinked: jest.fn().mockResolvedValue(overrides.isLinked ?? true) };
  return new ListImportService(prisma as never, {} as never, registry as never, visibility as never, {} as never, {} as never);
}

function tenant(partial: Partial<TenantContext>): TenantContext {
  return {
    userId: "u1",
    tenantId: "t1",
    tenantName: "Comercio",
    tenantType: "RETAILER",
    tenantRole: "OWNER",
    commercialTenantId: "t1",
    ...partial,
  };
}

describe("ListImportService.resolveAccess", () => {
  test("superadmin escribe la lista base", async () => {
    const access = await service().resolveAccess({ userId: "u", isSuperadmin: true, tenant: null }, "LIST_ACME");
    expect(access).toMatchObject({ level: "BASE", tenantId: "sup-1", supplierTenantId: "sup-1" });
  });

  test("el proveedor dueño de la clave escribe la lista base", async () => {
    const access = await service().resolveAccess(
      { userId: "u", isSuperadmin: false, tenant: tenant({ tenantId: "sup-1", commercialTenantId: "sup-1", tenantType: "DISTRIBUTOR", tenantRole: "ADMIN" }) },
      "LIST_ACME"
    );
    expect(access.level).toBe("BASE");
  });

  test("un comercio vinculado escribe sus precios propios", async () => {
    const access = await service().resolveAccess({ userId: "u", isSuperadmin: false, tenant: tenant({}) }, "LIST_ACME");
    expect(access).toMatchObject({ level: "TENANT", tenantId: "t1" });
  });

  test("un comercio sin vínculo no puede", async () => {
    await expect(
      service({ isLinked: false }).resolveAccess({ userId: "u", isSuperadmin: false, tenant: tenant({}) }, "LIST_ACME")
    ).rejects.toThrow(/vinculado/);
  });

  test("un vendedor (rol sin permiso) no puede", async () => {
    await expect(
      service().resolveAccess({ userId: "u", isSuperadmin: false, tenant: tenant({ tenantRole: "SELLER" }) }, "LIST_ACME")
    ).rejects.toThrow(/dueños/);
  });

  test("un proveedor con API no admite listas", async () => {
    await expect(service({ hasAdapter: true }).resolveAccess({ userId: "u", isSuperadmin: true, tenant: null }, "ELIT")).rejects.toThrow(/API/);
  });

  test("proveedor inexistente: 404", async () => {
    await expect(service({ supplier: null }).resolveAccess({ userId: "u", isSuperadmin: true, tenant: null }, "LIST_NADIE")).rejects.toThrow(
      /no encontrado/
    );
  });
});

describe("keyColumnsPresent", () => {
  const spec: ImportProfileSpec = {
    sheetIndex: 0,
    headerRow: 0,
    columnMap: { Código: "externalId", Producto: "name", Precio: "price", Marca: "brand" },
    currency: null,
    priceIncludesIva: false,
    ivaPercent: null,
    numberFormat: "COMMA",
    dividerMeaning: "IGNORE",
  };
  test("coincidencia parcial: nombre, precio y código siguen; una columna secundaria puede faltar", () => {
    expect(keyColumnsPresent(spec, ["Código", "Producto", "Precio", "Stock"])).toBe(true);
    expect(keyColumnsPresent(spec, ["Código", "Producto", "Precio USD"])).toBe(false);
  });
});
