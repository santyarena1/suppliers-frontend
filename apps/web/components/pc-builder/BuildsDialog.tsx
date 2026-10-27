"use client";

import { useEffect, useState } from "react";
import { FolderOpen, LayoutTemplate, Trash2, X } from "lucide-react";
import NodoSpinner from "@/components/NodoSpinner";
import { pcBuilderApi, type PcBuilderSettings, type PcBuildSummary } from "@/lib/api";

const when = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });

/**
 * Los armados guardados del comercio y sus plantillas: abrir, empezar desde una
 * plantilla o borrar. Abajo, lo que el comercio cobra por armar (dueño y admin).
 */
export default function BuildsDialog({
  currentId, manager, onOpen, onClose, onSettings,
}: {
  currentId: string | null;
  manager: boolean;
  /** `asTemplate`: se usa de punto de partida (no se edita la plantilla). */
  onOpen: (id: string, asTemplate: boolean) => void;
  onClose: () => void;
  onSettings: (s: PcBuilderSettings) => void;
}) {
  const [rows, setRows] = useState<PcBuildSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PcBuilderSettings | null>(null);
  const [laborName, setLaborName] = useState("");
  const [laborPrice, setLaborPrice] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    pcBuilderApi.builds().then((r) => setRows(r.data)).catch(() => setError("No se pudieron traer los armados."));
    pcBuilderApi.settings().then((r) => {
      setSettings(r.data);
      setLaborName(r.data.laborName ?? "");
      setLaborPrice(r.data.laborPrice != null ? String(r.data.laborPrice) : "");
    }).catch(() => undefined);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  async function remove(b: PcBuildSummary) {
    if (!window.confirm(`¿Borrar "${b.title}"? No se puede deshacer.`)) return;
    try {
      await pcBuilderApi.deleteBuild(b.id);
      setRows((r) => (r ?? []).filter((x) => x.id !== b.id));
    } catch {
      setError("No se pudo borrar.");
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    setSaved(false);
    try {
      const raw = laborPrice.replace(/\./g, "").replace(",", ".").trim();
      const value = raw ? Number(raw) : null;
      const { data } = await pcBuilderApi.saveSettings({ laborName: laborName.trim() || null, laborPrice: value != null && value >= 0 ? value : null });
      setSettings(data);
      onSettings(data);
      setSaved(true);
    } catch {
      setError("No se pudo guardar lo que cobrás por armar.");
    } finally {
      setSavingSettings(false);
    }
  }

  const templates = (rows ?? []).filter((r) => r.template);
  const builds = (rows ?? []).filter((r) => !r.template);
  const item = (b: PcBuildSummary) => (
    <li key={b.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${b.id === currentId ? "border-brand-500/60 bg-brand-600/10" : "border-surface-800"}`}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{b.title}</span>
        <span className="block truncate text-[11px] text-surface-500">{[b.clientName, `actualizado ${when(b.updatedAt)}`, !b.mine && "de otra persona del equipo"].filter(Boolean).join(" · ")}</span>
      </span>
      <button type="button" onClick={() => onOpen(b.id, b.template)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand-600 px-2.5 text-xs font-semibold text-white hover:bg-brand-500">
        {b.template ? <LayoutTemplate className="h-3.5 w-3.5" /> : <FolderOpen className="h-3.5 w-3.5" />}
        {b.template ? "Usar" : "Abrir"}
      </button>
      {(b.mine || manager) && (!b.template || manager) && (
        <button type="button" onClick={() => void remove(b)} aria-label={`Borrar ${b.title}`} className="rounded-md p-1.5 text-surface-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
      )}
    </li>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Armados guardados" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={onClose}>
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-surface-700 bg-surface-900 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-surface-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Armados guardados</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-surface-400 hover:text-white"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-3">
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          {!rows && !error ? (
            <div className="flex justify-center py-8"><NodoSpinner className="h-5 w-5" /></div>
          ) : (
            <>
              <section>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-surface-500">Plantillas</h3>
                {templates.length ? <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{templates.map(item)}</ul> : (
                  <p className="text-xs text-surface-500">{manager ? "Guardá un armado como plantilla (\"Gamer 1080p\", \"Oficina\") para que el equipo arranque desde ahí." : "Todavía no hay plantillas."}</p>
                )}
              </section>
              <section>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-surface-500">Armados</h3>
                {builds.length ? <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{builds.map(item)}</ul> : <p className="text-xs text-surface-500">Todavía no guardaste ningún armado.</p>}
              </section>
            </>
          )}
          {settings && (
            <section className="rounded-lg border border-surface-800 p-3">
              <h3 className="text-sm font-semibold text-white">Lo que cobrás por armar</h3>
              <p className="mt-0.5 text-xs text-surface-400">Se suma solo a cada armado como línea del presupuesto. Precio final con IVA, en pesos.</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                <label className="flex flex-col gap-1 text-xs text-surface-400">Descripción<input value={laborName} disabled={!manager} onChange={(e) => setLaborName(e.target.value)} placeholder="Armado, prueba y Windows" className="h-9 rounded-lg border border-surface-700 bg-surface-950 px-3 text-sm text-white disabled:opacity-60" /></label>
                <label className="flex flex-col gap-1 text-xs text-surface-400">Precio ($)<input value={laborPrice} disabled={!manager} onChange={(e) => setLaborPrice(e.target.value)} inputMode="decimal" placeholder="45000" className="h-9 rounded-lg border border-surface-700 bg-surface-950 px-3 text-right font-mono text-sm text-white disabled:opacity-60" /></label>
              </div>
              {manager ? (
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" disabled={savingSettings} onClick={() => void saveSettings()} className="h-9 rounded-lg border border-surface-600 px-3 text-sm font-semibold text-surface-100 hover:border-surface-400 disabled:opacity-50">{savingSettings ? "Guardando…" : "Guardar"}</button>
                  {saved && <span className="text-xs text-emerald-300">Guardado.</span>}
                </div>
              ) : <p className="mt-2 text-[11px] text-surface-500">Lo cambian el dueño o un administrador.</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
