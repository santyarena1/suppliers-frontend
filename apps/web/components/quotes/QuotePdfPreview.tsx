"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Pencil, X } from "lucide-react";
import { useQuoteSettings } from "@/components/quotes/quote-share";
import { buildQuotePdfModel, quotePdfFilename } from "@/components/quotes/pdf/quote-pdf-model";
import { useQuoteConverter, type Quote } from "@/lib/quotes";

/**
 * El PDF tal cual lo recibe el cliente, sin abrir el editor. Se arma en el
 * navegador con la plantilla del comercio (igual que "Descargar PDF").
 */
export default function QuotePdfPreview({ quote, onClose, onOpen }: { quote: Quote; onClose: () => void; onOpen: () => void }) {
  const settings = useQuoteSettings();
  const money = useQuoteConverter(quote.currency);
  const built = useMemo(() => (settings ? buildQuotePdfModel(quote, settings, money) : null), [quote, settings, money]);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!built || !settings) return;
    if ("error" in built) {
      setError(built.error);
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    setError(null);
    import("@/components/quotes/pdf/generate")
      .then(({ renderQuotePdf }) => renderQuotePdf(built.model, settings.logoUrl))
      .then((b) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch(() => alive && setError("No se pudo armar la vista previa del PDF."));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [built, settings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function download() {
    if (!blob || !built || "error" in built) return;
    const { downloadBlob } = await import("@/components/quotes/pdf/generate");
    downloadBlob(blob, quotePdfFilename(built.model));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="Vista previa del PDF">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-surface-700 bg-surface-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-surface-800 px-4 py-2.5">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            {built && "model" in built ? built.model.code : `#${quote.number}`}
            {quote.title || quote.clientName ? <span className="font-normal text-surface-400"> · {quote.title || quote.clientName}</span> : null}
          </p>
          <button type="button" onClick={download} disabled={!blob} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-surface-200 hover:border-surface-500 hover:text-white disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Descargar
          </button>
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500">
            <Pencil className="h-3.5 w-3.5" /> Abrir para editar
          </button>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-surface-400 hover:bg-surface-800 hover:text-white" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-900">
          {error ? (
            <p className="px-6 text-center text-sm text-red-300">{error}</p>
          ) : url ? (
            <iframe src={`${url}#toolbar=0&view=FitH`} title="PDF del presupuesto" className="h-full w-full" />
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-surface-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Armando el PDF…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
