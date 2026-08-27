import type { TenantType } from "@/lib/auth";

const RETAILER_ONLY = ["/search", "/comparador", "/cart", "/proveedores", "/marcas", "/avisos"];
const DISTRIBUTOR_ONLY = ["/clientes"];
const BRAND_ONLY = ["/marca"];
const SUPPLIER_ONLY = ["/codigos", "/publicidad"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * A dónde mandar si alguien entra por URL a una pantalla que no es de su tipo.
 * El superadmin no se redirige: el árbol y la búsqueda le siguen sirviendo.
 */
export function tenantRouteRedirect(
  pathname: string,
  tenantType: TenantType | null | undefined,
  isSuperadmin: boolean
): string | null {
  if (isSuperadmin || !tenantType) return null;
  if (tenantType === "DISTRIBUTOR") {
    if (matchesPrefix(pathname, RETAILER_ONLY) || matchesPrefix(pathname, BRAND_ONLY)) return "/";
  }
  if (tenantType === "RETAILER") {
    if (
      matchesPrefix(pathname, DISTRIBUTOR_ONLY) ||
      matchesPrefix(pathname, BRAND_ONLY) ||
      matchesPrefix(pathname, SUPPLIER_ONLY)
    ) {
      return "/";
    }
  }
  if (tenantType === "BRAND") {
    if (
      matchesPrefix(pathname, RETAILER_ONLY) ||
      matchesPrefix(pathname, DISTRIBUTOR_ONLY) ||
      matchesPrefix(pathname, ["/mensajes", "/pedidos"])
    ) {
      return "/";
    }
  }
  return null;
}
