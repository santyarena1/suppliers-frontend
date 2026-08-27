"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import NodoSpinner from "@/components/NodoSpinner";
import { CheckoutGhostButton } from "@/components/checkout/CheckoutForm";

export type AccountDetailLine = { label: string; value: string };
export type AccountDetailItem = {
  code?: string;
  name: string;
  qty?: string | number;
  price?: string | number;
  total?: string | number;
};
export type AccountDetailDoc = { label: string; href: string; filename?: string };

export default function AccountRowDetail({
  open,
  title,
  lines,
  items,
  totals,
  documents,
  note,
  upload,
  onClose,
}: {
  open: boolean;
  title: string;
  lines: AccountDetailLine[];
  items?: AccountDetailItem[];
  totals?: AccountDetailLine[];
  documents?: AccountDetailDoc[];
  note?: string;
  upload?: {
    label: string;
    accept?: string;
    loading?: boolean;
    error?: string | null;
    onFile: (file: File) => void;
  };
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-row-title"
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-surface-950 border border-surface-800 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="px-5 py-4 border-b border-surface-800 flex items-start justify-between gap-3 sticky top-0 bg-surface-950">
          <h2 id="account-row-title" className="text-base font-semibold text-white tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} className="text-surface-500 hover:text-white p-1" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          {lines.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {lines.filter((l) => l.value).map((l) => (
                <div key={l.label} className="contents">
                  <dt className="text-[10px] uppercase tracking-wider text-surface-500 pt-0.5">{l.label}</dt>
                  <dd className="text-surface-200 break-words">{l.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {(items ?? []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-2">Ítems</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-surface-500">
                    <th className="text-left font-semibold pb-1.5 pr-2">Producto</th>
                    <th className="text-right font-semibold pb-1.5">Cant.</th>
                    <th className="text-right font-semibold pb-1.5 pl-2">P. unit.</th>
                    <th className="text-right font-semibold pb-1.5 pl-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-800">
                  {items!.map((it, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-2 text-surface-200">
                        {it.code ? <span className="font-mono text-surface-500 mr-1.5">{it.code}</span> : null}
                        {it.name}
                      </td>
                      <td className="py-1.5 text-right text-surface-400 whitespace-nowrap">{it.qty ?? ""}</td>
                      <td className="py-1.5 text-right tabular-nums text-surface-400 whitespace-nowrap pl-2">{it.price ?? ""}</td>
                      <td className="py-1.5 text-right tabular-nums text-surface-200 whitespace-nowrap pl-2">{it.total ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(totals ?? []).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-2">Importes</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {totals!.filter((l) => l.value).map((l) => (
                  <div key={l.label} className="contents">
                    <dt className="text-[10px] uppercase tracking-wider text-surface-500 pt-0.5">{l.label}</dt>
                    <dd className="text-surface-200 text-right tabular-nums break-words">{l.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {(documents ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {documents!.map((doc) => (
                <CheckoutGhostButton
                  key={doc.href + doc.label}
                  type="button"
                  disabled={busy === doc.href}
                  onClick={async () => {
                    setDlError(null);
                    setBusy(doc.href);
                    try {
                      const { downloadAuthedFile } = await import("@/lib/api");
                      await downloadAuthedFile(doc.href, doc.filename || "documento");
                    } catch (err) {
                      setDlError(err instanceof Error ? err.message : "No se pudo descargar");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === doc.href ? <NodoSpinner className="w-3.5 h-3.5" /> : null}
                  {doc.label}
                </CheckoutGhostButton>
              ))}
            </div>
          )}

          {upload && (
            <div className="border border-surface-800 rounded-lg p-3 flex flex-col gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">{upload.label}</p>
              <input
                ref={fileRef}
                type="file"
                accept={upload.accept || ".pdf,image/*,.jpg,.jpeg,.png"}
                className="text-xs text-surface-300 file:mr-2 file:rounded-sm file:border-0 file:bg-surface-800 file:px-2 file:py-1 file:text-xs file:text-white"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.onFile(f);
                }}
              />
              {upload.loading && <NodoSpinner className="w-4 h-4" />}
              {upload.error && <p className="text-xs text-red-400">{upload.error}</p>}
            </div>
          )}

          {(note || dlError) && (
            <p className="text-xs text-surface-500 leading-snug">{dlError || note}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function VerMasButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-medium text-sky-400 hover:text-white underline underline-offset-2 whitespace-nowrap"
    >
      Ver más
    </button>
  );
}
