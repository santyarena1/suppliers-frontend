"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import type { VisibleProvider } from "@/lib/api";
import { getUser } from "@/lib/auth";

/** El aviso se abre solo como mucho una vez cada 3 días. */
const AUTO_OPEN_EVERY_MS = 3 * 24 * 60 * 60_000;

function seenKey(): string {
  return `nodo.outOfSearch.seenAt.${getUser()?.id ?? "anon"}`;
}

function readSeenAt(): number {
  try {
    return Number(localStorage.getItem(seenKey()) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function markSeen() {
  try {
    localStorage.setItem(seenKey(), String(Date.now()));
  } catch {
    // Sin almacenamiento el aviso vuelve a abrirse: no rompe nada.
  }
}

/** Por qué un distribuidor conectado no está en la búsqueda, en criollo. */
function reasonFor(p: VisibleProvider & { syncPaused?: boolean }): string {
  if (p.syncPaused) return "Sincronización pausada por errores seguidos. Reactivala desde el distribuidor.";
  if (p.configured === false) return "Todavía no tiene precios: falta cargar la cuenta o aplicar la lista.";
  if (p.includeInSearch === false) return "Lo sacaste de la búsqueda.";
  return "Tu plan ya está usando todos los lugares de búsqueda.";
}

/**
 * Ícono de advertencia al lado del filtro de distribuidores cuando hay conectados
 * que no participan de la búsqueda. El detalle se abre al tocarlo y, solo, cada 3 días.
 */
export default function OutOfSearchNotice({
  providers,
  autoOpen = true,
}: {
  providers: VisibleProvider[];
  /** false durante el recorrido guiado: no tapar los pasos con el aviso. */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const count = providers.length;

  useEffect(() => {
    if (count === 0 || !autoOpen) return;
    if (Date.now() - readSeenAt() < AUTO_OPEN_EVERY_MS) return;
    setOpen(true);
    markSeen();
  }, [count, autoOpen]);

  if (count === 0) return null;
  const label = count === 1 ? "1 distribuidor conectado no participa de la búsqueda" : `${count} distribuidores conectados no participan de la búsqueda`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          markSeen();
        }}
        title={label}
        aria-label={label}
        className="relative inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 transition-colors hover:bg-amber-500/20 hover:text-amber-200 active:scale-[0.97]"
      >
        <AlertTriangle className="h-4 w-4" />
        <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-[18px] text-surface-950">
          {count}
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="out-of-search-title"
            className="w-full max-w-md rounded-xl border border-surface-700 bg-surface-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
                <h3 id="out-of-search-title" className="text-sm font-semibold text-white">
                  {label}
                </h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="text-surface-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-surface-400">
              Sus productos no aparecen cuando buscás, así que podés estar perdiendo mejores precios.
            </p>
            <ul className="mt-3 flex max-h-64 flex-col divide-y divide-surface-800 overflow-y-auto rounded-lg border border-surface-800">
              {providers.map((p) => (
                <li key={p.provider} className="px-3 py-2.5">
                  <p className="text-sm font-medium text-white">{p.name}</p>
                  <p className="mt-0.5 text-xs text-surface-400">{reasonFor(p)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg bg-surface-800 py-2 text-sm font-medium text-white hover:bg-surface-700"
              >
                Ahora no
              </button>
              <Link
                href="/proveedores"
                onClick={() => setOpen(false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-500"
              >
                Elegir cuáles <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
