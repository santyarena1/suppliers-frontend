"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ALL_PROVIDERS,
  PROVIDER_LABELS,
  imageSyncApi,
  type ImageSyncMissingItem,
  type ImageSyncStatus,
  type Provider,
} from "@/lib/api";
import { Image as ImageIcon, KeyRound, Loader2, Play, Square } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export default function ImageSyncPanel({
  showToast,
}: {
  showToast: (m: string, ok?: boolean) => void;
}) {
  const [status, setStatus] = useState<ImageSyncStatus | null>(null);
  const [missing, setMissing] = useState<ImageSyncMissingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [provider, setProvider] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const [st, miss] = await Promise.all([
        imageSyncApi.status(),
        imageSyncApi.missing({ take: 12, provider: provider || undefined }),
      ]);
      setStatus(st.data);
      setMissing(miss.data.items);
    } catch {
      setStatus(null);
      setMissing([]);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!status?.running) return;
    const id = setInterval(() => void load(), 2500);
    return () => clearInterval(id);
  }, [status?.running, load]);

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSavingKey(true);
    try {
      await imageSyncApi.saveSerper(apiKey.trim());
      setApiKey("");
      showToast("API key de Serper guardada");
      await load();
    } catch (err) {
      showToast(errMsg(err, "No se pudo guardar la clave"), false);
    } finally {
      setSavingKey(false);
    }
  }

  async function clearKey() {
    setSavingKey(true);
    try {
      await imageSyncApi.clearSerper();
      showToast("Se quitó la API key de Serper");
      await load();
    } catch (err) {
      showToast(errMsg(err, "No se pudo borrar la clave"), false);
    } finally {
      setSavingKey(false);
    }
  }

  async function run(once: boolean) {
    setStarting(true);
    try {
      const r = await imageSyncApi.firstPhoto({
        provider: provider || undefined,
        batchSize: 50,
        once,
      });
      if (r.data.started) {
        showToast(once ? "Tanda de 50 iniciada" : "Primera foto iniciada en segundo plano");
      } else {
        showToast(r.data.reason === "already_running" ? "Ya hay una corrida en curso" : "No se inició", false);
      }
      await load();
    } catch (err) {
      showToast(errMsg(err, "No se pudo iniciar Primera foto"), false);
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    setStopping(true);
    try {
      await imageSyncApi.stop();
      showToast("Se pidió cortar al terminar el producto actual");
      await load();
    } catch (err) {
      showToast(errMsg(err, "No se pudo detener"), false);
    } finally {
      setStopping(false);
    }
  }

  if (loading && !status) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      </div>
    );
  }

  const runRow = status?.lastRun;
  const running = Boolean(status?.running);
  const pct =
    runRow && runRow.missingTotal > 0
      ? Math.min(100, Math.round((runRow.processed / runRow.missingTotal) * 100))
      : running
        ? 5
        : 0;

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-semibold text-white">Sincronización de imágenes</h2>
        <p className="text-xs text-surface-500 mt-1">
          Solo para productos <span className="text-surface-300">sin foto</span>. Primera foto busca en Google
          vía Serper y guarda la primera imagen. De a tandas de 50, en segundo plano.
        </p>
      </div>

      <form onSubmit={saveKey} className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-surface-200">
          <KeyRound className="w-4 h-4 text-surface-500" />
          API de Serper
          {status?.hasSerperKey ? (
            <span className="text-[11px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
              clave cargada
            </span>
          ) : (
            <span className="text-[11px] uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
              falta la clave
            </span>
          )}
        </div>
        <p className="text-xs text-surface-500">
          Se guarda cifrada. No se vuelve a mostrar. La sacás de{" "}
          <a href="https://serper.dev/api-key" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">
            serper.dev/api-key
          </a>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.hasSerperKey ? "Reemplazar clave…" : "X-API-KEY de Serper"}
            className="flex-1 min-w-[200px] bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={savingKey || apiKey.trim().length < 8}
            className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg px-3 py-2"
          >
            {savingKey ? "Guardando…" : "Guardar"}
          </button>
          {status?.hasSerperKey && (
            <button
              type="button"
              onClick={() => void clearKey()}
              disabled={savingKey}
              className="border border-surface-700 text-surface-300 hover:text-white text-sm rounded-lg px-3 py-2"
            >
              Quitar
            </button>
          )}
        </div>
      </form>

      <div className="border border-surface-800 rounded-xl p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-semibold text-white tabular-nums">{status?.missing ?? "—"}</p>
            <p className="text-xs text-surface-500">productos sin imagen</p>
          </div>
          <label className="text-xs text-surface-500">
            Distribuidor
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1 block bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-sm text-white"
            >
              <option value="">Todos</option>
              {ALL_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p as Provider]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {runRow && (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 rounded-full bg-surface-800 overflow-hidden">
              <div
                className={`h-full transition-all ${running ? "bg-brand-500" : runRow.status === "ERROR" ? "bg-red-500" : "bg-emerald-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-surface-500">
              {running ? "En curso" : runRow.status === "OK" ? "Última corrida lista" : runRow.status === "CANCELLED" ? "Cortada" : "Error"}
              {" · "}
              {runRow.updated} fotos · {runRow.skipped} sin resultado · {runRow.failed} error
              {runRow.processed > 0 ? ` · ${runRow.processed} procesados` : ""}
              {runRow.lastQuery ? ` · última: ${runRow.lastQuery}` : ""}
            </p>
            {runRow.errorMessage && <p className="text-xs text-red-400">{runRow.errorMessage}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void run(false)}
            disabled={starting || running || !status?.hasSerperKey || (status?.missing ?? 0) === 0}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-3 py-2"
          >
            {starting || running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Primera foto
          </button>
          <button
            type="button"
            onClick={() => void run(true)}
            disabled={starting || running || !status?.hasSerperKey || (status?.missing ?? 0) === 0}
            className="inline-flex items-center gap-2 border border-surface-700 text-surface-200 hover:text-white disabled:opacity-40 text-sm rounded-lg px-3 py-2"
          >
            Solo 50
          </button>
          {running && (
            <button
              type="button"
              onClick={() => void stop()}
              disabled={stopping}
              className="inline-flex items-center gap-2 border border-red-500/30 text-red-300 hover:text-white text-sm rounded-lg px-3 py-2"
            >
              <Square className="w-3.5 h-3.5" />
              Detener
            </button>
          )}
        </div>
      </div>

      {status && status.byProvider.length > 0 && (
        <div className="border border-surface-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-surface-500 bg-surface-900">
              <tr>
                <th className="text-left font-medium px-4 py-2">Proveedor</th>
                <th className="text-right font-medium px-4 py-2">Sin foto</th>
                <th className="text-right font-medium px-4 py-2">Catálogo</th>
              </tr>
            </thead>
            <tbody>
              {status.byProvider.map((row) => (
                <tr key={row.provider} className="border-t border-surface-800">
                  <td className="px-4 py-2 text-surface-200">{PROVIDER_LABELS[row.provider as Provider] ?? row.provider}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-white">{row.missing}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-surface-500">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-surface-500 mb-2">Muestra sin foto</h3>
          <ul className="flex flex-col gap-1.5">
            {missing.map((it) => (
              <li key={it.id} className="border border-surface-800 rounded-lg px-3 py-2">
                <p className="text-sm text-surface-200 line-clamp-1">{it.name}</p>
                <p className="text-[11px] text-surface-500 font-mono truncate">
                  {PROVIDER_LABELS[it.provider as Provider] ?? it.provider} · {it.query}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status?.missing === 0 && (
        <p className="text-sm text-surface-500 flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          No hay fichas sin imagen en el catálogo.
        </p>
      )}
    </div>
  );
}
