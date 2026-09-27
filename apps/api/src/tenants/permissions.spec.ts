import {
  PERMISSION_KEYS,
  TENANT_ROLES_BY_TYPE,
  TENANT_ROLES_CAN_APPROVE_ORDERS,
  TENANT_ROLES_CAN_CONFIRM_ORDERS,
  TENANT_ROLES_CAN_MANAGE_PORTFOLIO,
  TENANT_ROLES_CAN_MANAGE_TEAM,
  TENANT_ROLES_CAN_ORDER,
  TENANT_ROLES_CAN_PURGE_CATALOG,
  permissionsForType,
  resolvePermissions,
  tenantCanWriteChat,
  type PermissionKey,
  type TenantType,
} from "@nodo/shared";
import { canEditClientTerms, clientLinkVisibleTo } from "./portfolio";

const TYPES: TenantType[] = ["RETAILER", "DISTRIBUTOR", "BRAND"];

describe("resolvePermissions · equivalencia con los roles fijos de antes", () => {
  for (const type of TYPES) {
    for (const role of TENANT_ROLES_BY_TYPE[type]) {
      it(`${type} · ${role} conserva lo que podía hacer`, () => {
        const can = new Set<PermissionKey>(resolvePermissions({ type, role }));
        expect(can.has("orders.create")).toBe(TENANT_ROLES_CAN_ORDER.includes(role));
        expect(can.has("orders.confirm")).toBe(TENANT_ROLES_CAN_CONFIRM_ORDERS.includes(role));
        expect(can.has("orders.approve")).toBe(TENANT_ROLES_CAN_APPROVE_ORDERS.includes(role));
        expect(can.has("catalog.purge")).toBe(TENANT_ROLES_CAN_PURGE_CATALOG.includes(role));
        expect(can.has("team.manage")).toBe(TENANT_ROLES_CAN_MANAGE_TEAM.includes(role));
        expect(can.has("codes.manage")).toBe(TENANT_ROLES_CAN_MANAGE_TEAM.includes(role));
        expect(can.has("portfolio.manage")).toBe(TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(role));
        // Antes: canWrite de brand-actions/catalog/resources.
        expect(can.has("brand.manage")).toBe(
          role === "COMMERCIAL" || role === "MARKETING" || TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(role)
        );
        expect(can.has("ads.manage")).toBe(TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(role));
        expect(can.has("chat.write")).toBe(tenantCanWriteChat(type, role));
        expect(can.has("portfolio.edit_terms")).toBe(canEditClientTerms(role));
        const seesAll = clientLinkVisibleTo({ accountManagerId: "otro" }, { tenantRole: role, userId: "yo" });
        expect(can.has("portfolio.view_all")).toBe(seesAll);
      });
    }
  }
});

describe("resolvePermissions · excepciones", () => {
  it("el dueño tiene todo aunque le carguen excepciones", () => {
    const can = resolvePermissions({
      type: "RETAILER",
      role: "OWNER",
      roleOverrides: { "orders.approve": false },
      memberOverrides: { "team.manage": false },
    });
    expect(can).toEqual([...PERMISSION_KEYS]);
  });

  it("la excepción del rol pisa el valor por defecto", () => {
    const can = resolvePermissions({ type: "RETAILER", role: "BUYER", roleOverrides: { "orders.approve": true } });
    expect(can).toContain("orders.approve");
  });

  it("la excepción de la persona pisa la del rol", () => {
    const can = resolvePermissions({
      type: "RETAILER",
      role: "BUYER",
      roleOverrides: { "orders.approve": true },
      memberOverrides: { "orders.approve": false },
    });
    expect(can).not.toContain("orders.approve");
  });

  it("apagar un permiso por defecto funciona", () => {
    const can = resolvePermissions({ type: "RETAILER", role: "ADMIN", memberOverrides: { "providers.manage": false } });
    expect(can).not.toContain("providers.manage");
  });

  it("credenciales y configuración de proveedores quedan para dueño y administrador", () => {
    expect(resolvePermissions({ type: "RETAILER", role: "BUYER" })).not.toContain("providers.manage");
    expect(resolvePermissions({ type: "RETAILER", role: "VIEWER" })).not.toContain("providers.manage");
    expect(resolvePermissions({ type: "RETAILER", role: "ADMIN" })).toContain("providers.manage");
  });
});

describe("permissionsForType", () => {
  it("un comercio no ve permisos de cartera ni de marca", () => {
    const keys = permissionsForType("RETAILER").map((permission) => permission.key);
    expect(keys).not.toContain("portfolio.manage");
    expect(keys).not.toContain("brand.manage");
    expect(keys).toContain("orders.approve");
  });
});
