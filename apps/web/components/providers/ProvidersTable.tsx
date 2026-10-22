"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, MessageSquare, RefreshCw, Search, Settings } from "lucide-react";
import NodoSpinner from "@/components/NodoSpinner";
import SyncProgressBar from "@/components/SyncProgressBar";
import ProviderBadge from "@/components/ProviderBadge";
import SearchToggle from "@/components/subscription/SearchToggle";
import { ListFreshnessChip } from "@/components/list-import/ListFreshnessHints";
import { type SyncHealth } from "@/components/SyncHealthBanner";
import {
  IMPLEMENTED_PROVIDERS, canSyncProvider, isListProvider, isLiveSyncRun, summarizeSyncRun,
  type Provider, type ProviderStatus, type VisibleProvider,
} from "@/lib/api";

export type ProviderRowState = "syncing" | "attention" | "account" | "list" | "ok" | "stale";

type Row = {
  p: VisibleProvider;
  s: ProviderStatus | undefined;
  bySpreadsheet: boolean;
  state: ProviderRowState;
  reason: string;
};

/** Precios de más de dos días: se avisa aunque la cuenta esté bien. */
const STALE_MS = 2 * 24 * 60 * 60 * 1000;

const STATE_PILL: Record<ProviderRowState, { label: string; cls: string; order: number }> = {
  attention: { label: "Necesita atención", cls: "bg-amber-500/15 text-amber-300", order: 0 },
  account: { label: "Falta la cuenta", cls: "bg-red-500/15 text-red-300", order: 1 },
  stale: { label: "Precios viejos", cls: "bg-amber-500/15 text-amber-300", order: 2 },
  syncing: { label: "Actualizando", cls: "bg-brand-500/15 text-brand-300", order: 3 },
  list: { label: "Por lista", cls: "bg-sky-500/15 text-sky-300", order: 4 },
  ok: { label: "Al día", cls: "bg-emerald-500/15 text-emerald-300", order: 5 },
};

const FILTERS: { id: "all" | "attention" | "ok" | "list"; label: string; test: (r: Row) => boolean }[] = [
  { id: "all", label: "Todos", test: () => true },
  { id: "attention", label: "Necesitan atención", test: (r) => r.state === "attention" || r.state === "account" || r.state === "stale" },
  { id: "ok", label: "Al día", test: (r) => r.state === "ok" || r.state === "syncing" },
  { id: "list", label: "Por lista", test: (r) => r.state === "list" },
];

export function providerRowState(p: VisibleProvider, s: ProviderStatus | undefined, syncing: boolean): { state: ProviderRowState; reason: string } {
  const bySpreadsheet = isListProvider(p.provider) || !IMPLEMENTED_PROVIDERS.includes(p.provider);
  const health = (s as { health?: SyncHealth | null } | undefined)?.health;
  if (syncing || isLiveSyncRun(s?.currentRun)) return { state: "syncing", reason: "Trayendo precios y stock" };
  if (health?.paused || p.syncPaused) {
    const why = (health?.pauseReason || "el portal no respondió varias veces").replace(/[.\s]+$/, "");
    return { state: "attention", reason: `Pausado: ${why}. Sus productos no salen en la búsqueda.` };
  }
  if (p.configured === false) {
    return { state: "attention", reason: bySpreadsheet ? "No sale en la búsqueda hasta que apliques una lista." : "No sale en la búsqueda hasta que cargues la cuenta y actualices." };
  }
  if (bySpreadsheet) return { state: "list", reason: "Los precios entran por la planilla que subís" };
  if (!s?.hasCredentials && !s?.publicCatalog) return { state: "account", reason: "Cargá el usuario del portal para traer tus precios" };
  if (!s?.lastSyncedAt) return { state: "stale", reason: "Todavía no se actualizó nunca: actualizalo para traer el catálogo" };
  if (s?.lastSyncedAt && Date.now() - new Date(s.lastSyncedAt).getTime() > STALE_MS) {
    return { state: "stale", reason: health?.failureReason ? `Última prueba: ${health.failureReason}` : "Hace más de dos días que no se actualiza" };
  }
  return { state: "ok", reason: "" };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

/**
 * Los distribuidores del comercio en una tabla: estado, catálogo, cuándo se
 * actualizó y qué hacer. Pensada para muchos: buscador, filtros y orden.
 */
export default function ProvidersTable({
  providers,
  statuses,
  syncingProvider,
  syncResult,
  retailer,
  chatAllowed,
  onSync,
  onSearchChanged,
}: {
  providers: VisibleProvider[];
  statuses: Partial<Record<string, ProviderStatus>>;
  syncingProvider: Provider | null;
  syncResult: Record<string, { ok: boolean; msg: string } | undefined>;
  retailer: boolean;
  chatAllowed: boolean;
  onSync: (provider: Provider, e: React.MouseEvent) => void;
  onSearchChanged: () => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [sort, setSort] = useState<"estado" | "nombre" | "productos">("estado");

  const rows: Row[] = useMemo(
    () =>
      providers.map((p) => {
        const s = statuses[p.provider];
        const { state, reason } = providerRowState(p, s, syncingProvider === p.provider);
        return { p, s, bySpreadsheet: isListProvider(p.provider) || !IMPLEMENTED_PROVIDERS.includes(p.provider), state, reason };
      }),
    [providers, statuses, syncingProvider]
  );

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter(active.test)
    .filter((r) => !needle || r.p.name.toLowerCase().includes(needle) || r.p.provider.toLowerCase().includes(needle))
    .sort((a, b) =>
      sort === "nombre"
        ? a.p.name.localeCompare(b.p.name, "es")
        : sort === "productos"
          ? (b.s?.total ?? 0) - (a.s?.total ?? 0)
          : STATE_PILL[a.state].order - STATE_PILL[b.state].order || a.p.name.localeCompare(b.p.name, "es")
    );

  return (
    <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-white">Tus distribuidores</h2>
        <span className="text-xs text-surface-500 tabular-nums">
          {shown.length} de {rows.length}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Buscar distribuidor</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar distribuidor"
            className="h-10 w-full rounded-lg border border-surface-700 bg-surface-950 pl-9 pr-3 text-sm text-white placeholder:text-surface-500 focus:border-brand-500 focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar distribuidores">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`min-h-[36px] rounded-lg border px-3 text-xs font-semibold transition-colors ${
                filter === f.id
                  ? "border-brand-500 bg-brand-600/15 text-brand-300"
                  : "border-surface-700 text-surface-400 hover:border-surface-500 hover:text-white"
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{rows.filter(f.test).length}</span>
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="prov-sort">Ordenar</label>
        <select
          id="prov-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-10 rounded-lg border border-surface-700 bg-surface-950 px-3 text-sm text-surface-200 focus:border-brand-500 focus:outline-none"
        >
          <option value="estado">Primero los que necesitan atención</option>
          <option value="nombre">Nombre A–Z</option>
          <option value="productos">Más productos</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-surface-500">Ningún distribuidor coincide con la búsqueda.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {shown.map((r) => (
            <ProviderRow
              key={r.p.provider}
              row={r}
              syncing={syncingProvider === r.p.provider}
              result={syncResult[r.p.provider]}
              retailer={retailer}
              chatAllowed={chatAllowed}
              onSync={onSync}
              onSearchChanged={onSearchChanged}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProviderRow({
  row, syncing, result, retailer, chatAllowed, onSync, onSearchChanged,
}: {
  row: Row;
  syncing: boolean;
  result: { ok: boolean; msg: string } | undefined;
  retailer: boolean;
  chatAllowed: boolean;
  onSync: (provider: Provider, e: React.MouseEvent) => void;
  onSearchChanged: () => void;
}) {
  const { p, s, bySpreadsheet, state, reason } = row;
  const pill = STATE_PILL[state];
  const live = syncing || isLiveSyncRun(s?.currentRun);
  const href = `/proveedores/${p.provider}`;
  return (
    <li className="border-t border-surface-800 py-3 first:border-t-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 lg:grid-cols-[minmax(170px,1fr)_150px_130px_120px_170px_300px]">
        <Link href={href} className="min-w-0">
          <ProviderBadge provider={p.provider} label={p.name} variant="inline" size="md" />
          {p.accountManager && (
            <span className="mt-0.5 block truncate text-[11px] text-surface-500">Tu vendedor: {p.accountManager.name}</span>
          )}
        </Link>

        <div className="justify-self-end lg:justify-self-start">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${pill.cls}`}>{pill.label}</span>
        </div>

        <Link href={href} className="whitespace-nowrap text-sm text-surface-300 lg:text-right">
          <span className="font-mono tabular-nums text-white">{(s?.total ?? 0).toLocaleString("es-AR")}</span>
          <span className="text-surface-500"> productos</span>
          {s?.withStock != null && (
            <span className="block text-[11px] text-surface-500 tabular-nums">{s.withStock.toLocaleString("es-AR")} con stock</span>
          )}
        </Link>

        <div className="text-sm">
          {bySpreadsheet ? (
            <ListFreshnessChip provider={p.provider} />
          ) : (
            <span className={state === "stale" ? "text-amber-300" : "text-surface-300"}>
              {s?.lastSyncedAt ? relativeTime(s.lastSyncedAt) : "Nunca actualizado"}
            </span>
          )}
        </div>

        <div className="col-span-2 lg:col-span-1">
          {retailer && !p.platformHidden && p.configured !== false && (
            <SearchToggle provider={p.provider} name={p.name} inSearch={p.inSearch !== false} onChanged={onSearchChanged} />
          )}
        </div>

        <div className="col-span-2 flex flex-wrap items-center justify-end gap-1.5 lg:col-span-1">
          {p.linkId && chatAllowed && (
            <Link
              href={`/mensajes?linkId=${p.linkId}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-surface-700 px-2.5 text-xs font-semibold text-surface-200 hover:border-surface-500 hover:text-white"
              title={p.accountManager ? `Hablar con ${p.accountManager.name}` : "Hablar con el vendedor asignado"}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="sr-only lg:not-sr-only">Hablar</span>
            </Link>
          )}
          <Link
            href={`${href}?tab=config`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-surface-700 px-2.5 text-xs font-semibold text-surface-200 hover:border-surface-500 hover:text-white"
          >
            <Settings className="h-3.5 w-3.5" /> Configurar
          </Link>
          {bySpreadsheet ? (
            <Link
              href={`${href}?tab=lists`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-500"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Subir lista
            </Link>
          ) : state === "account" ? (
            <Link
              href={`${href}?tab=credentials`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-500"
            >
              Cargar cuenta
            </Link>
          ) : (
            <button
              type="button"
              onClick={(e) => onSync(p.provider, e)}
              disabled={live || !canSyncProvider(s)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-40"
            >
              {live ? <NodoSpinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {live ? "Actualizando" : "Actualizar"}
            </button>
          )}
        </div>
      </div>

      {(reason && state !== "ok" && state !== "list") && (
        <p className={`mt-1.5 text-xs ${state === "syncing" ? "text-surface-400" : "text-amber-200/90"}`}>{reason}</p>
      )}
      {live && <div className="mt-2"><SyncProgressBar run={s?.currentRun} /></div>}
      {result && !live && (
        <p className={`mt-1.5 text-xs ${result.ok ? "text-emerald-300" : "text-red-300"}`}>
          {result.msg}{" "}
          {result.ok && <Link href={`${href}?tab=sync`} className="underline">Ver qué cambió</Link>}
        </p>
      )}
      {!result && !live && state === "ok" && s?.currentRun?.status === "OK" && (
        <p className="mt-1 text-[11px] text-surface-500">
          Última: {summarizeSyncRun(s.currentRun)} · <Link href={`${href}?tab=sync`} className="underline">ver cambios</Link>
        </p>
      )}
    </li>
  );
}
