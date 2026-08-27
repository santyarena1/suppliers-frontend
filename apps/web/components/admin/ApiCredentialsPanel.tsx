"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { catalogEnrichmentApi, imageSyncApi } from "@/lib/api";
import { KeyRound, Loader2, Sparkles, Image as ImageIcon } from "lucide-react";
import type { ConfigToast } from "@/components/admin/SystemConfigPanels";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

/** Credenciales de APIs externas (OpenAI, Serper) — solo superadmin. */
export default function ApiCredentialsPanel({ showToast }: { showToast: ConfigToast }) {
  const [loading, setLoading] = useState(true);
  const [hasOpenAi, setHasOpenAi] = useState(false);
  const [hasSerper, setHasSerper] = useState(false);
  const [openAiKey, setOpenAiKey] = useState("");
  const [serperKey, setSerperKey] = useState("");
  const [savingOpenAi, setSavingOpenAi] = useState(false);
  const [savingSerper, setSavingSerper] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalog, images] = await Promise.all([
        catalogEnrichmentApi.overview(),
        imageSyncApi.status(),
      ]);
      setHasOpenAi(catalog.data.aiConfigured);
      setHasSerper(images.data.hasSerperKey);
    } catch {
      showToast("No se pudieron cargar las credenciales", false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveOpenAi(e: FormEvent) {
    e.preventDefault();
    if (!openAiKey.trim()) return;
    setSavingOpenAi(true);
    try {
      await catalogEnrichmentApi.saveOpenAi(openAiKey.trim());
      setOpenAiKey("");
      setHasOpenAi(true);
      showToast("API key de OpenAI guardada");
    } catch (err) {
      showToast(errMsg(err, "No se pudo guardar OpenAI"), false);
    } finally {
      setSavingOpenAi(false);
    }
  }

  async function clearOpenAi() {
    setSavingOpenAi(true);
    try {
      await catalogEnrichmentApi.clearOpenAi();
      setHasOpenAi(false);
      showToast("Se quitó la API key de OpenAI");
    } catch (err) {
      showToast(errMsg(err, "No se pudo quitar OpenAI"), false);
    } finally {
      setSavingOpenAi(false);
    }
  }

  async function saveSerper(e: FormEvent) {
    e.preventDefault();
    if (!serperKey.trim()) return;
    setSavingSerper(true);
    try {
      await imageSyncApi.saveSerper(serperKey.trim());
      setSerperKey("");
      setHasSerper(true);
      showToast("API key de Serper guardada");
    } catch (err) {
      showToast(errMsg(err, "No se pudo guardar Serper"), false);
    } finally {
      setSavingSerper(false);
    }
  }

  async function clearSerper() {
    setSavingSerper(true);
    try {
      await imageSyncApi.clearSerper();
      setHasSerper(false);
      showToast("Se quitó la API key de Serper");
    } catch (err) {
      showToast(errMsg(err, "No se pudo quitar Serper"), false);
    } finally {
      setSavingSerper(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-surface-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-brand-400" />
          Credenciales API
        </h2>
        <p className="text-xs text-surface-500 mt-1 leading-relaxed">
          Claves de servicios externos. Se guardan cifradas y no se vuelven a mostrar.
        </p>
      </div>

      <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white">OpenAI</h3>
          {hasOpenAi ? (
            <span className="text-[11px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
              clave cargada
            </span>
          ) : (
            <span className="text-[11px] uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
              opcional
            </span>
          )}
        </div>
        <p className="text-xs text-surface-500 leading-relaxed">
          Mejora las sugerencias de fusión y el completado de productos en Admin → Catálogo.
        </p>
        <form onSubmit={saveOpenAi} className="flex flex-wrap gap-2">
          <input
            type="password"
            autoComplete="off"
            value={openAiKey}
            onChange={(e) => setOpenAiKey(e.target.value)}
            placeholder={hasOpenAi ? "Reemplazar clave…" : "sk-…"}
            className="flex-1 min-w-[200px] bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={savingOpenAi || openAiKey.trim().length < 8}
            className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg px-3 py-2"
          >
            {savingOpenAi ? "Guardando…" : "Guardar"}
          </button>
          {hasOpenAi && (
            <button
              type="button"
              onClick={() => void clearOpenAi()}
              disabled={savingOpenAi}
              className="border border-surface-700 text-surface-300 hover:text-white text-sm rounded-lg px-3 py-2"
            >
              Quitar
            </button>
          )}
        </form>
      </section>

      <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ImageIcon className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-white">Serper</h3>
          {hasSerper ? (
            <span className="text-[11px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
              clave cargada
            </span>
          ) : (
            <span className="text-[11px] uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
              falta la clave
            </span>
          )}
        </div>
        <p className="text-xs text-surface-500 leading-relaxed">
          Busca la primera foto de productos sin imagen (Admin → Imágenes). Sacá la clave en{" "}
          <a
            href="https://serper.dev/api-key"
            target="_blank"
            rel="noreferrer"
            className="text-brand-400 hover:underline"
          >
            serper.dev/api-key
          </a>
          .
        </p>
        <form onSubmit={saveSerper} className="flex flex-wrap gap-2">
          <input
            type="password"
            autoComplete="off"
            value={serperKey}
            onChange={(e) => setSerperKey(e.target.value)}
            placeholder={hasSerper ? "Reemplazar clave…" : "X-API-KEY de Serper"}
            className="flex-1 min-w-[200px] bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={savingSerper || serperKey.trim().length < 8}
            className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg px-3 py-2"
          >
            {savingSerper ? "Guardando…" : "Guardar"}
          </button>
          {hasSerper && (
            <button
              type="button"
              onClick={() => void clearSerper()}
              disabled={savingSerper}
              className="border border-surface-700 text-surface-300 hover:text-white text-sm rounded-lg px-3 py-2"
            >
              Quitar
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
