import type { TenantType } from "@nodo/shared";

export type NewsAuthorSet = {
  ownId: string;
  linkedSupplierIds: string[];
  linkedClientDistributorIds: string[];
  advertisedAuthorIds: string[];
};

/**
 * Quién puede aparecer como autor en el feed de esta organización.
 * Distro no ve distros; marca no ve marcas; la publicidad solo abre al comercio.
 */
export function authorIdsForViewer(viewerType: TenantType, set: NewsAuthorSet): string[] {
  const unique = new Set<string>();
  if (viewerType === "RETAILER") {
    for (const id of set.linkedSupplierIds) unique.add(id);
    for (const id of set.advertisedAuthorIds) unique.add(id);
    return [...unique];
  }
  unique.add(set.ownId);
  if (viewerType === "DISTRIBUTOR") {
    for (const id of set.linkedSupplierIds) unique.add(id);
    return [...unique];
  }
  for (const id of set.linkedClientDistributorIds) unique.add(id);
  return [...unique];
}

export function canRetailerSeeCommercialFiles(linked: boolean): boolean {
  return linked;
}
