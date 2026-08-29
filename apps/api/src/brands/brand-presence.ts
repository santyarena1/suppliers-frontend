export const BRAND_MODULE_IDS = [
  "space",
  "products",
  "actions",
  "materials",
  "trainings",
  "contact",
] as const;

export type BrandModuleId = (typeof BRAND_MODULE_IDS)[number];

export interface BrandModuleState {
  ready: boolean;
  count: number;
}

export interface BrandPresence {
  /** El vínculo existe, pero la marca no publicó ningún módulo. */
  pending: boolean;
  readyCount: number;
  total: number;
  modules: Record<BrandModuleId, BrandModuleState>;
}

export function hasBrandSpace(input: {
  logoUrl?: string | null;
  headline?: string | null;
  about?: string | null;
  html?: string | null;
  heroUrl?: string | null;
}): boolean {
  return Boolean(
    input.logoUrl?.trim() ||
      input.headline?.trim() ||
      input.about?.trim() ||
      input.html?.trim() ||
      input.heroUrl?.trim()
  );
}

export function hasBrandContact(input: {
  supportEmail?: string | null;
  supportPhone?: string | null;
  websiteUrl?: string | null;
}): boolean {
  return Boolean(input.supportEmail?.trim() || input.supportPhone?.trim() || input.websiteUrl?.trim());
}

export function brandPresence(input: {
  signalCount: number;
  actionCount: number;
  materialCount: number;
  trainingCount: number;
  hasContact: boolean;
  hasSpace: boolean;
}): BrandPresence {
  const modules: Record<BrandModuleId, BrandModuleState> = {
    space: { ready: input.hasSpace, count: input.hasSpace ? 1 : 0 },
    products: { ready: input.signalCount > 0, count: input.signalCount },
    actions: { ready: input.actionCount > 0, count: input.actionCount },
    materials: { ready: input.materialCount > 0, count: input.materialCount },
    trainings: { ready: input.trainingCount > 0, count: input.trainingCount },
    contact: { ready: input.hasContact, count: input.hasContact ? 1 : 0 },
  };
  const readyCount = BRAND_MODULE_IDS.filter((id) => modules[id].ready).length;
  return {
    pending: readyCount === 0,
    readyCount,
    total: BRAND_MODULE_IDS.length,
    modules,
  };
}
