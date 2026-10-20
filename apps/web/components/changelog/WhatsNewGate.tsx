"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { announcementsApi } from "@/lib/api";
import { getImpersonator, getUser } from "@/lib/auth";
import { APP_VERSION, markVersionSeen, readSeenVersion, unseenEntries, type ChangelogEntry } from "@/lib/changelog";
import { useOnboarding } from "@/lib/onboarding";
import ChangelogEntryView from "./ChangelogEntryView";

/** Espera para no tapar la primera pintura de la pantalla. */
const SHOW_DELAY_MS = 1500;
/** En el modal, como mucho las últimas tres versiones que no vio. */
const MAX_ENTRIES = 3;
const serverKey = `changelog:${APP_VERSION}`;

/**
 * "Qué hay de nuevo": se abre una vez por versión nueva para cada persona. Lo
 * visto queda en el navegador y en el servidor (así no se repite en otra PC).
 * No aparece en el recorrido guiado, al "Entrar como" ni en la página de novedades.
 */
export default function WhatsNewGate() {
  const userId = getUser()?.id ?? null;
  const pathname = usePathname();
  const onboarding = useOnboarding();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    if (!userId || getImpersonator() || onboarding.active || pathname.startsWith("/actualizaciones")) return;
    const pending = unseenEntries(readSeenVersion(userId));
    if (pending.length === 0) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      announcementsApi
        .seen()
        .then((res) => {
          if (!alive) return;
          if (res.data?.seen?.includes(serverKey)) markVersionSeen(userId);
          else setEntries(pending.slice(0, MAX_ENTRIES));
        })
        // Sin respuesta del servidor se muestra igual: el navegador recuerda que ya se vio.
        .catch(() => alive && setEntries(pending.slice(0, MAX_ENTRIES)));
    }, SHOW_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [userId, onboarding.active, pathname]);

  const close = useCallback(() => {
    setEntries([]);
    markVersionSeen(userId);
    void announcementsApi.markSeen(serverKey).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (entries.length === 0) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entries.length, close]);

  if (entries.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-surface-700 bg-surface-950 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-800 bg-gradient-to-br from-brand-600/20 via-surface-950 to-surface-950 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600/20 text-brand-300">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 id="whats-new-title" className="text-base font-semibold text-white">
                Qué hay de nuevo en NODO
              </h2>
              <p className="text-xs text-surface-400">Versión {APP_VERSION}</p>
            </div>
          </div>
          <button type="button" onClick={close} className="rounded-md p-1.5 text-surface-400 hover:bg-surface-800 hover:text-white" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {entries.map((e, i) => (
            <ChangelogEntryView key={e.version} entry={e} current={i === 0} />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-surface-800 px-5 py-3">
          <Link href="/actualizaciones" onClick={close} className="text-xs font-medium text-surface-400 hover:text-white">
            Ver todas las versiones
          </Link>
          <button type="button" onClick={close} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500">
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
