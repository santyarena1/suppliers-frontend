import type { TenantType } from "@/lib/auth";

const RETAILER_ONLY = ["/search", "/comparador", "/cart", "/proveedores", "/marcas"];
const DISTRIBUTOR_ONLY = ["/clientes", "/codigos", "/publicidad"];
// `/mensajes` y `/equipo` son de los dos tipos: no redirigir.

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
  if (tenantType === "DISTRIBUTOR" && matchesPrefix(pathname, RETAILER_ONLY)) return "/";
  if (tenantType === "RETAILER" && matchesPrefix(pathname, DISTRIBUTOR_ONLY)) return "/";
  return null;
}
