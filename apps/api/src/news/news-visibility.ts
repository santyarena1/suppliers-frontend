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

/** Qué adjuntos viajan según audiencia. La lista de precios nunca sale sin vínculo. */
export function visibleNewsAttachments<T extends { kind: string; visibility: string }>(
  attachments: T[],
  opts: { linked: boolean; publicView?: boolean }
): T[] {
  const canDownloadCommercial = opts.linked && !opts.publicView;
  return attachments.filter((item) => {
    if (opts.publicView) return item.visibility === "PUBLIC";
    if (item.kind === "PRICE_LIST" || item.visibility === "IN_APP") return canDownloadCommercial;
    return true;
  });
}
