"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import ChangelogEntryView from "@/components/changelog/ChangelogEntryView";
import { announcementsApi } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { APP_VERSION, CHANGELOG, markVersionSeen } from "@/lib/changelog";

/** Todas las versiones de NODO, de la más nueva a la más vieja. Entrar acá cuenta como visto. */
export default function UpdatesPage() {
  useEffect(() => {
    markVersionSeen(getUser()?.id);
    void announcementsApi.markSeen(`changelog:${APP_VERSION}`).catch(() => undefined);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/15 text-brand-300">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-semibold text-white">Qué hay de nuevo</h1>
            <p className="text-xs text-surface-500">Funciones nuevas, mejoras y arreglos de cada versión. Estás en la {APP_VERSION}.</p>
          </div>
        </header>
        <ol className="relative space-y-8 border-l border-surface-800 pl-5">
          {CHANGELOG.map((entry, i) => (
            <li key={entry.version} className="relative">
              <span className={`absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-brand-400 ring-4 ring-brand-500/20" : "bg-surface-700"}`} />
              <ChangelogEntryView entry={entry} current={i === 0} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
