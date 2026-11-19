"use client";

import { useState } from "react";
import { Download, FileText, Loader2, Truck } from "lucide-react";
import { downloadAuthedFile, openAuthedFile, type OrderDocument } from "@/lib/api";
import { documentFilename } from "@/lib/documentFilename";

const KIND_LABEL: Record<string, string> = {
  FACTURA: "Factura",
  NOTA_CREDITO: "Nota de crédito",
  NOTA_DEBITO: "Nota de débito",
  REMITO: "Remito",
};

function money(total: number | null, currency: string | null): string | null {
  if (total == null) return null;
  const n = total.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "USD" || currency === "DOL" ? `US$ ${n}` : `$ ${n}`;
}

function day(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** Facturas y remitos que NODO bajó del portal del distribuidor para este pedido. */
export default function OrderDocuments({ orderId, provider, documents }: { orderId: string; provider: string; documents: OrderDocument[] }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (documents.length === 0) return null;

  async function open(doc: OrderDocument, save = false) {
    setOpening(doc.id);
    setError(null);
    try {
      const path = `/orders/${orderId}/documents/${doc.id}`;
      if (save) await downloadAuthedFile(path, documentFilename(provider, doc.kind, doc.number, doc.date));
      else await openAuthedFile(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el PDF");
    } finally {
      setOpening(null);
    }
  }

  return (
    <section aria-label="Comprobantes del pedido" className="flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Comprobantes del distribuidor</p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {documents.map((d) => {
          const Icon = d.kind === "REMITO" ? Truck : FileText;
          const credit = d.kind === "NOTA_CREDITO";
          const amount = money(d.total, d.currency);
          return (
            <li key={d.id} className="flex items-stretch">
              <button
                type="button"
                onClick={() => void open(d)}
                disabled={opening === d.id}
                title={d.cae ? `CAE ${d.cae}${d.generated ? " · PDF armado por NODO con los datos oficiales" : ""}` : "Abrir el PDF"}
                className={`flex items-center gap-2 rounded-l-lg border px-2.5 py-1.5 text-left text-xs transition-colors disabled:opacity-60 ${
                  credit
                    ? "border-emerald-500/25 bg-emerald-500/[0.06] hover:border-emerald-400/50"
                    : "border-surface-700 bg-surface-950/40 hover:border-brand-500/60"
                }`}
              >
                {opening === d.id ? <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-surface-400" /> : <Icon className="h-3.5 w-3.5 flex-shrink-0 text-surface-400" />}
                <span className="min-w-0">
                  <span className="block font-semibold text-white">
                    {KIND_LABEL[d.kind] ?? d.kind}
                    {d.number ? <span className="ml-1 font-mono font-normal text-surface-400">{d.number}</span> : null}
                  </span>
                  {(amount || d.date) && (
                    <span className="block text-[11px] text-surface-500">
                      {[day(d.date), amount && (credit ? `− ${amount}` : amount)].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void open(d, true)}
                disabled={opening === d.id}
                title={`Descargar como ${documentFilename(provider, d.kind, d.number, d.date)}`}
                aria-label="Descargar PDF"
                className="flex items-center rounded-r-lg border border-l-0 border-surface-700 bg-surface-950/40 px-2 text-surface-400 transition-colors hover:border-brand-500/60 hover:text-white disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </section>
  );
}
