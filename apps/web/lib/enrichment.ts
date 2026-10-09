import api from "@/lib/api";

/** Módulo de superadmin "Productos enriquecidos" (docs/PLAN_ENRIQUECIMIENTO.md). */

export type MasterStatus = "NEW" | "ENRICHING" | "ENRICHED" | "REVIEW" | "FAILED";
export type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "APPLIED";
export type ProposalField = "images" | "description" | "longDescription" | "attributes" | "category";
export type RunStatus = "RUNNING" | "DONE" | "CANCELLED" | "FAILED";

export const MASTER_STATUS_LABELS: Record<MasterStatus, string> = {
  NEW: "Sin enriquecer",
  ENRICHING: "Enriqueciendo",
  ENRICHED: "Enriquecido",
  REVIEW: "Para revisar",
  FAILED: "Sin datos",
};

export const FIELD_LABELS: Record<ProposalField, string> = {
  images: "Fotos",
  description: "Descripción corta",
  longDescription: "Descripción larga",
  attributes: "Atributos",
  category: "Categoría",
};

export const SOURCE_LABELS: Record<string, string> = {
  icecat: "Open Icecat",
  manufacturer: "Web oficial",
  distributor: "Distribuidor",
  ai: "IA",
};

export interface EnrichmentOverview {
  masters: number;
  byStatus: Partial<Record<MasterStatus, number>>;
  doubtful: number;
  multiProvider: number;
  hasAiImage: number;
  missingDescription: number;
  proposals: { pending: number; approved: number };
  categories: { key: string; label: string; count: number }[];
  sources: { icecat: boolean; ai: boolean; manufacturers: { source: string; brands: string[] }[] };
  applyEnabled: boolean;
}

export interface MasterListItem {
  id: string;
  name: string;
  brand: string | null;
  partNumber: string | null;
  ean: string | null;
  matchKind: string;
  categoryKey: string | null;
  categoryLabel: string | null;
  status: MasterStatus;
  doubtful: boolean;
  doubtReason: string | null;
  memberCount: number;
  providers: string[];
  hasAiImage: boolean;
  missingDescription: boolean;
  bestConfidence: number | null;
  enrichedAt: string | null;
  currentImage: string | null;
  proposedImage: string | null;
  proposals: { field: ProposalField; status: ProposalStatus; confidence: number; source: string }[];
}

export interface MasterFilters {
  q?: string;
  category?: string;
  brand?: string;
  provider?: string;
  status?: MasterStatus;
  hasAiImage?: boolean;
  missingDescription?: boolean;
  doubtful?: boolean;
  multiProvider?: boolean;
  minConfidence?: number;
  maxConfidence?: number;
}

export interface AttributeValue {
  value: string | number | boolean;
  unit?: string;
  source: string;
  confidence: number;
  evidence?: string;
}

export interface GalleryImage {
  url: string;
  source: string;
  origin?: string;
  width?: number;
  height?: number;
  assetUrl?: string;
  persistError?: string;
}

export interface Proposal {
  id: string;
  field: ProposalField;
  value: {
    images?: GalleryImage[];
    text?: string;
    schema?: string;
    version?: number;
    values?: Record<string, AttributeValue>;
    key?: string;
    label?: string;
  };
  source: string;
  confidence: number;
  evidence: Record<string, unknown> | null;
  status: ProposalStatus;
  decidedAt: string | null;
  updatedAt: string;
}

export interface Ficha {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  partNumber: string | null;
  ean: string | null;
  description: string | null;
  longDescription: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  warranty: string | null;
  aiImage: boolean;
  manual: boolean;
}

export interface MasterDetail {
  master: {
    id: string;
    key: string;
    matchKind: string;
    name: string;
    brand: string | null;
    partNumber: string | null;
    ean: string | null;
    categoryKey: string | null;
    categoryLabel: string | null;
    status: MasterStatus;
    doubtful: boolean;
    doubtReason: string | null;
    memberCount: number;
    bestConfidence: number | null;
    enrichedAt: string | null;
    lockedManual: boolean;
  };
  fichas: Ficha[];
  proposals: Proposal[];
  schema: { categoryKey: string; version: number; attributes: { key: string; label: string; type: string; unit?: string }[] };
  applyEnabled: boolean;
  applyNote: string;
}

export interface EnrichmentRun {
  id: string;
  kind: string;
  status: RunStatus;
  total: number;
  processed: number;
  failed: number;
  proposals: number;
  aiCalls: number;
  estCostUsd: number;
  maxItems: number;
  maxCostUsd: number;
  cancelRequested: boolean;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  log: { at: string; masterId?: string; msg: string }[] | null;
}

export interface ApplyPreview {
  applyEnabled: boolean;
  note: string;
  fichas: {
    provider: string;
    externalId: string;
    name: string;
    changes: {
      field: ProposalField;
      status: ProposalStatus;
      column: string | null;
      current: string | null;
      proposed: string | null;
      currentIsAiImage?: boolean;
      fillEmpty: boolean;
      overwrite: boolean;
    }[];
  }[];
}

export interface RegroupResult {
  fichas: number;
  masters: number;
  created: number;
  updated: number;
  deleted: number;
  membersMoved: number;
  doubtful: number;
  ms: number;
}

/** Solo manda los filtros con valor (los booleanos en false no filtran). */
function cleanFilters(f: MasterFilters): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    out[k] = v as string | number | boolean;
  }
  return out;
}

export const enrichmentApi = {
  overview: () => api.get<EnrichmentOverview>("/admin/enrichment/overview"),
  list: (filters: MasterFilters, page: number, pageSize = 40, sort?: string) =>
    api.get<{ items: MasterListItem[]; total: number; page: number; pageSize: number }>("/admin/enrichment/masters", {
      params: { ...cleanFilters(filters), page, pageSize, ...(sort ? { sort } : {}) },
    }),
  detail: (id: string) => api.get<MasterDetail>(`/admin/enrichment/masters/${id}`),
  applyPreview: (id: string) => api.get<ApplyPreview>(`/admin/enrichment/masters/${id}/apply-preview`),
  enrichOne: (id: string) => api.post<{ run: EnrichmentRun; detail: MasterDetail }>(`/admin/enrichment/masters/${id}/enrich`, {}, { timeout: 180_000 }),
  decide: (id: string, field: ProposalField, decision: "APPROVED" | "REJECTED" | "PENDING") =>
    api.post<Proposal>(`/admin/enrichment/masters/${id}/proposals/${field}/decision`, { decision }, { timeout: 120_000 }),
  bulkDecide: (body: { decision: "APPROVED" | "REJECTED"; minConfidence: number; field?: ProposalField; filter?: MasterFilters; confirm?: boolean }) =>
    api.post<{ matched: number; updated: number }>("/admin/enrichment/proposals/bulk-decision", {
      ...body,
      ...(body.filter ? { filter: cleanFilters(body.filter) } : {}),
    }),
  split: (id: string, members: { provider: string; externalId: string }[]) =>
    api.post<{ originalId: string; newId: string }>(`/admin/enrichment/masters/${id}/split`, { members }),
  merge: (targetId: string, sourceIds: string[]) => api.post<{ targetId: string; merged: number }>("/admin/enrichment/masters/merge", { targetId, sourceIds }),
  regroup: () => api.post<RegroupResult>("/admin/enrichment/regroup", {}, { timeout: 600_000 }),
  runs: () => api.get<EnrichmentRun[]>("/admin/enrichment/runs"),
  run: (id: string) => api.get<EnrichmentRun>(`/admin/enrichment/runs/${id}`),
  startRun: (body: { kind: "sample" | "filter" | "ids"; filter?: MasterFilters; masterIds?: string[]; maxItems: number; maxCostUsd: number; onlyNew?: boolean }) =>
    api.post<EnrichmentRun>("/admin/enrichment/runs", { ...body, ...(body.filter ? { filter: cleanFilters(body.filter) } : {}) }),
  cancelRun: (id: string) => api.post<EnrichmentRun>(`/admin/enrichment/runs/${id}/cancel`, {}),
};

export function confidenceTone(c: number | null | undefined): "high" | "mid" | "low" | "none" {
  if (c === null || c === undefined) return "none";
  if (c >= 0.8) return "high";
  if (c >= 0.6) return "mid";
  return "low";
}
