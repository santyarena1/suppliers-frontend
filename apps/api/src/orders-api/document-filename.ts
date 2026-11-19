/**
 * Nombre de descarga de un comprobante guardado: DISTRIBUIDOR-TIPO-NÚMERO-FECHA.pdf
 * («ELIT-FA-A-00022-00000005-2026-11-17.pdf»). Igual que `apps/web/lib/documentFilename.ts`.
 */

const PROVIDER_SHORT: Record<string, string> = {
  NEW_BYTES: "NEWBYTES",
  NEW_TREE: "NEWTREE",
  SOLUTION_BOX: "SOLUTIONBOX",
  GRUPO_NUCLEO: "NUCLEO",
};

const KIND_CODE: Record<string, string> = { FACTURA: "FA", NOTA_CREDITO: "NC", NOTA_DEBITO: "ND", REMITO: "RE" };

const clean = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();

export const DOCUMENT_NAME_SELECT = {
  provider: true, kind: true, tipo: true, puntoVenta: true, numero: true, portalNumber: true, fechaEmision: true,
} as const;

export function storedDocumentFilename(d: {
  provider: string;
  kind: string;
  tipo: string | null;
  puntoVenta: number | null;
  numero: number | null;
  portalNumber: string | null;
  fechaEmision: string | null;
}): string {
  const number =
    d.puntoVenta != null && d.numero != null
      ? `${d.tipo ? `${d.tipo}-` : ""}${String(d.puntoVenta).padStart(5, "0")}-${String(d.numero).padStart(8, "0")}`
      : d.portalNumber;
  const day = /^\d{4}-\d{2}-\d{2}/.exec(d.fechaEmision ?? "")?.[0] ?? null;
  const parts = [PROVIDER_SHORT[d.provider] ?? clean(d.provider.replace(/^LIST_/, "")), KIND_CODE[d.kind] ?? "DOC", number ? clean(number) : null, day];
  return `${parts.filter(Boolean).join("-")}.pdf`;
}
