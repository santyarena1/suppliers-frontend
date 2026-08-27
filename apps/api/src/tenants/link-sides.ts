import type { TenantType } from "@nodo/shared";

/**
 * Quién puede estar de cada lado de un TenantLink.
 *
 * Comercio → distro o marca. Distro → marca. La marca nunca es el cliente.
 */
export function tenantLinkAllowed(clientType: TenantType, supplierType: TenantType): boolean {
  if (supplierType === "RETAILER") return false;
  if (clientType === "RETAILER") return supplierType === "DISTRIBUTOR" || supplierType === "BRAND";
  if (clientType === "DISTRIBUTOR") return supplierType === "BRAND";
  return false;
}

export function tenantLinkRejection(clientType: TenantType, supplierType: TenantType): string | null {
  if (tenantLinkAllowed(clientType, supplierType)) return null;
  if (supplierType === "RETAILER") {
    return "El lado proveedor tiene que ser un distribuidor o una marca";
  }
  if (clientType === "BRAND") {
    return "Una marca no es el lado cliente del vínculo";
  }
  if (clientType === "DISTRIBUTOR") {
    return "Un distribuidor solo se vincula como cliente con una marca";
  }
  return "Esa combinación de organizaciones no se puede vincular";
}
