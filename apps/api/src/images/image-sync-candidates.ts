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

/** Skip permanente: sin query no tiene sentido gastar créditos ni reintentar. */
export const PERMANENT_SKIP_ERROR = "Sin texto para buscar";

/** Primer fallo: Serper no trajo una imagen que cargue. Se permite 1 reintento. */
export const NO_USABLE_PHOTO_ERROR = "Serper no devolvió una foto que cargue";

/** Tras el reintento: no volver a buscar (evita gasto infinito de créditos). */
export const NO_USABLE_PHOTO_EXHAUSTED_ERROR =
  "Serper no devolvió una foto que cargue · sin más reintentos";

export const NON_RETRYABLE_ERRORS: string[] = [
  PERMANENT_SKIP_ERROR,
  NO_USABLE_PHOTO_EXHAUSTED_ERROR,
];

/** Si ya falló una vez con “sin foto usable”, el próximo fallo queda agotado. */
export function nextNoUsablePhotoError(previousError: string | null | undefined): string {
  if (
    previousError === NO_USABLE_PHOTO_ERROR ||
    previousError === NO_USABLE_PHOTO_EXHAUSTED_ERROR
  ) {
    return NO_USABLE_PHOTO_EXHAUSTED_ERROR;
  }
  return NO_USABLE_PHOTO_ERROR;
}

export function missingWhere(provider?: Provider): Prisma.ProviderSyncCacheWhereInput {
  return provider ? { provider, AND: [missingImage] } : missingImage;
}

/**
 * Faltantes a procesar / reintentar:
 * - nunca tocados, o
 * - fallidos / salteados reintentables (p. ej. timeout, primer “sin foto usable”)
 * No incluye skip permanente ni “sin foto usable” ya reintentado.
 */
export function candidateWhere(
  provider?: Provider,
  priority: ImageSyncPriority = "all"
): Prisma.ProviderSyncCacheWhereInput {
  const retryable: Prisma.ProviderSyncCacheWhereInput = {
    OR: [
      { imageFills: { none: {} } },
      {
        imageFills: {
          some: {
            status: { in: ["failed", "skipped"] },
            NOT: { error: { in: NON_RETRYABLE_ERRORS } },
          },
        },
      },
    ],
  };
  const base: Prisma.ProviderSyncCacheWhereInput = {
    AND: [missingWhere(provider), retryable],
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
