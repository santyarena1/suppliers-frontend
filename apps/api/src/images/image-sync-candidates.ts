import { Prisma } from "@prisma/client";
import type { Provider } from "@nodo/shared";

const missingImage: Prisma.ProviderSyncCacheWhereInput = {
  OR: [{ imageUrl: null }, { imageUrl: "" }],
};

/** Misma regla que el catálogo: oferta activa con stock > 0 (el umbral mínimo se aplica al leer). */
export const visibleInCatalogOffer: Prisma.TenantProductOfferListRelationFilter = {
  some: { active: true, stock: { gt: 0 } },
};

export const notVisibleInCatalog: Prisma.ProviderSyncCacheWhereInput = {
  offers: { none: { active: true, stock: { gt: 0 } } },
};

export type ImageSyncPriority = "visible" | "deferred" | "all";

export function missingWhere(provider?: Provider): Prisma.ProviderSyncCacheWhereInput {
  return provider ? { provider, AND: [missingImage] } : missingImage;
}

/** Faltantes que todavía no se intentaron. `visible` = se muestran en algún catálogo con stock. */
export function candidateWhere(
  provider?: Provider,
  priority: ImageSyncPriority = "all"
): Prisma.ProviderSyncCacheWhereInput {
  const base: Prisma.ProviderSyncCacheWhereInput = {
    AND: [missingWhere(provider), { imageFills: { none: {} } }],
  };
  if (priority === "visible") {
    return { AND: [base, { offers: visibleInCatalogOffer }] };
  }
  if (priority === "deferred") {
    return { AND: [base, notVisibleInCatalog] };
  }
  return base;
}

/** Si todavía hay productos del catálogo, esta corrida no gasta créditos en los diferidos. */
export function resolveRunPriority(pendingVisible: number): Exclude<ImageSyncPriority, "all"> {
  return pendingVisible > 0 ? "visible" : "deferred";
}
