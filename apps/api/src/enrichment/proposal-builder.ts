import { AttributeValue } from "./attributes";
import { VerifiedImage } from "./image-verify";
import { CategorySchema } from "./schemas";
import { SourceResult } from "./sources/types";
import { TAXONOMY_BY_KEY } from "./taxonomy";

export const PROPOSAL_FIELDS = ["images", "description", "longDescription", "attributes", "category"] as const;
export type ProposalField = (typeof PROPOSAL_FIELDS)[number];

export interface ProposalDraft {
  field: ProposalField;
  value: Record<string, unknown>;
  source: string;
  confidence: number;
  evidence: Record<string, unknown>;
}

/** Confianza por origen de una foto. Prioridad: oficial > Icecat > distribuidor. */
export const IMAGE_CONFIDENCE: Record<string, number> = { manufacturer: 0.95, icecat: 0.9, distributor: 0.6 };
const IMAGE_ORDER: Record<string, number> = { manufacturer: 0, icecat: 1, distributor: 2 };
export const MAX_GALLERY = 8;

export interface BuildInput {
  categoryKey: string | null;
  categoryVia: "category" | "name" | "icecat" | null;
  schema: CategorySchema;
  icecat: SourceResult | null;
  manufacturer: SourceResult | null;
  images: VerifiedImage[];
  attributes: Record<string, AttributeValue>;
  aiText: { description: string | null; longDescription: string | null; note?: string } | null;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** Largo máximo de la descripción corta tomada de un texto oficial. */
const SHORT_MAX = 200;

/** Primera oración (o recorte en palabra) para la descripción corta. */
export function shortText(text: string | null | undefined): string | null {
  const clean = text?.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const sentence = clean.match(/^.{20,}?[.!?](?=\s|$)/)?.[0];
  if (sentence && sentence.length <= SHORT_MAX) return sentence;
  if (clean.length <= SHORT_MAX) return clean;
  return `${clean.slice(0, SHORT_MAX).replace(/\s+\S*$/, "")}…`;
}

function imagesProposal(images: VerifiedImage[]): ProposalDraft | null {
  const ok = images
    .filter((i) => i.ok)
    .sort((a, b) => (IMAGE_ORDER[a.source] ?? 9) - (IMAGE_ORDER[b.source] ?? 9))
    .slice(0, MAX_GALLERY);
  if (ok.length === 0) return null;
  const sources = [...new Set(ok.map((i) => i.source))];
  return {
    field: "images",
    value: {
      images: ok.map(({ url, source, origin, width, height, mime, bytes, fingerprint }) => ({ url, source, origin, width, height, mime, bytes, fingerprint })),
    },
    source: sources.join(","),
    confidence: IMAGE_CONFIDENCE[ok[0].source] ?? 0.5,
    evidence: {
      rejected: images.filter((i) => !i.ok).map((i) => ({ url: i.url, source: i.source, reason: i.reason })),
    },
  };
}

function textProposal(
  field: "description" | "longDescription",
  options: { text: string | null | undefined; source: string; confidence: number; evidence: Record<string, unknown> }[]
): ProposalDraft | null {
  const pick = options.find((o) => o.text && o.text.trim().length >= 20);
  if (!pick || !pick.text) return null;
  return { field, value: { text: pick.text.trim() }, source: pick.source, confidence: pick.confidence, evidence: pick.evidence };
}

function attributesProposal(schema: CategorySchema, attributes: Record<string, AttributeValue>): ProposalDraft | null {
  const entries = Object.entries(attributes);
  if (entries.length === 0) return null;
  const mean = entries.reduce((s, [, v]) => s + v.confidence, 0) / entries.length;
  return {
    field: "attributes",
    value: { schema: schema.categoryKey, version: schema.version, values: attributes },
    source: [...new Set(entries.map(([, v]) => v.source))].join(","),
    confidence: round(mean),
    evidence: { covered: entries.length, total: schema.attributes.length },
  };
}

function categoryProposal(input: BuildInput): ProposalDraft | null {
  if (!input.categoryKey) return null;
  const cat = TAXONOMY_BY_KEY[input.categoryKey];
  const confidence = input.categoryVia === "icecat" ? 0.95 : input.categoryVia === "category" ? 0.8 : 0.65;
  return {
    field: "category",
    value: { key: input.categoryKey, label: cat?.label ?? input.categoryKey },
    source: input.categoryVia === "icecat" ? "icecat" : "distributor",
    confidence,
    evidence: { via: input.categoryVia, icecatCategory: input.icecat?.category ?? null },
  };
}

/** Arma las propuestas de un maestro con lo que juntaron las fuentes. Pura. */
export function buildProposals(input: BuildInput): ProposalDraft[] {
  const icecat = input.icecat?.verified ? input.icecat : null;
  const official = input.manufacturer?.verified ? input.manufacturer : null;
  const sourceEvidence = (r: SourceResult) => ({ url: r.url, source: r.source, match: r.matchNote });

  const drafts = [
    imagesProposal(input.images),
    textProposal("description", [
      { text: icecat?.description, source: "icecat", confidence: 0.85, evidence: icecat ? sourceEvidence(icecat) : {} },
      { text: shortText(official?.description), source: "manufacturer", confidence: 0.8, evidence: official ? sourceEvidence(official) : {} },
      { text: input.aiText?.description, source: "ai", confidence: 0.6, evidence: { note: input.aiText?.note ?? "redactada solo con atributos verificados" } },
    ]),
    textProposal("longDescription", [
      { text: icecat?.longDescription, source: "icecat", confidence: 0.85, evidence: icecat ? sourceEvidence(icecat) : {} },
      {
        text: official?.description && official.description.length > 200 ? official.description : null,
        source: "manufacturer",
        confidence: 0.75,
        evidence: official ? sourceEvidence(official) : {},
      },
      { text: input.aiText?.longDescription, source: "ai", confidence: 0.6, evidence: { note: input.aiText?.note ?? "redactada solo con atributos verificados" } },
    ]),
    attributesProposal(input.schema, input.attributes),
    categoryProposal(input),
  ];
  return drafts.filter((d): d is ProposalDraft => d !== null);
}
