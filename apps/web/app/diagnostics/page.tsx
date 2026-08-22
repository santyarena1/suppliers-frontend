"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import PrefsPanel from "@/components/PrefsPanel";
import { ALL_PROVIDERS, Provider, searchApi, credentialsApi } from "@/lib/api";
import { PROVIDER_TEXT_COLOR as PROVIDER_COLOR } from "@/lib/providerColors";
import {
  CheckCircle2, XCircle, Loader2, AlertTriangle, Activity,
  Play, RotateCcw, Clock, Package, Minus, ChevronDown, ChevronRight
} from "lucide-react";

type Status = "idle" | "running" | "ok" | "empty" | "error" | "no_cred";

interface ProviderResult {
  status: Status;
  duration?: number;
  count?: number;
  error?: string;
  sample?: { name: string; price: string }[];
}

const SUGGESTED_QUERIES = ["ssd", "ryzen", "rtx", "ddr4", "monitor"];

export default function DiagnosticsPage() {
  const [query, setQuery] = useState("ssd");
  const [results, setResults] = useState<Record<string, ProviderResult>>({});
  const [configuredProviders, setConfiguredProviders] = useState<Set<Provider>>(new Set());
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [runningAll, setRunningAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<"all" | "configured">("configured");

  useEffect(() => {
    credentialsApi.mine().then((res) => {
      setConfiguredProviders(new Set(res.data.map((c) => c.providerName)));
    }).catch(() => {}).finally(() => setLoadingCreds(false));
  }, []);

  const testProvider = useCallback(async (provider: Provider) => {
    if (!query.trim()) return;
    setResults((prev) => ({ ...prev, [provider]: { status: "running" } }));
    const start = performance.now();
    try {
      const res = await searchApi.byProvider(provider, query.trim());
      const duration = Math.round(performance.now() - start);
      const data = Array.isArray(res.data) ? res.data : [];
      setResults((prev) => ({
        ...prev,
        [provider]: {
          status: data.length > 0 ? "ok" : "empty",
          duration,
          count: data.length,
          sample: data.slice(0, 3).map((p) => ({ name: p.name, price: String(p.price ?? "") })),
        },
      }));
    } catch (err: unknown) {
      const duration = Math.round(performance.now() - start);
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
      setResults((prev) => ({
        ...prev,
        [provider]: {
          status: "error",
          duration,
          error: e?.response?.data?.message || e?.message || `HTTP ${e?.response?.status || "?"}`,
        },
      }));
    }
  }, [query]);

  async function runAll() {
    if (runningAll) return;
    setRunningAll(true);
    const targets = scope === "all" ? ALL_PROVIDERS : ALL_PROVIDERS.filter((p) => configuredProviders.has(p));
    // Mark non-configured as no_cred if testing only configured
    const noCred: Record<string, ProviderResult> = {};
    if (scope === "configured") {
      ALL_PROVIDERS.filter((p) => !configuredProviders.has(p)).forEach((p) => {
        noCred[p] = { status: "no_cred" };
      });
    }
    setResults(noCred);

    await Promise.all(targets.map((p) => testProvider(p)));
    setRunningAll(false);
  }

  function clearAll() {
    setResults({});
    setExpanded(new Set());
  }

  function toggleExpand(p: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  const summary = {
    ok: Object.values(results).filter((r) => r.status === "ok").length,
    empty: Object.values(results).filter((r) => r.status === "empty").length,
    error: Object.values(results).filter((r) => r.status === "error").length,
    no_cred: Object.values(results).filter((r) => r.status === "no_cred").length,
    running: Object.values(results).filter((r) => r.status === "running").length,
  };
  const tested = summary.ok + summary.empty + summary.error;

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Navbar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
          <header className="flex-shrink-0 border-b border-surface-800 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-emerald-500/15 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-white">Diagnóstico de APIs</h1>
                <p className="text-xs text-surface-500">Testeá la conectividad de cada proveedor en tiempo real</p>
              </div>
            </div>
            <PrefsPanel />
          </header>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
            <div className="max-w-4xl mx-auto flex flex-col gap-5">

              {/* Test config */}
              <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Configuración del test</h2>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-medium text-surface-400 mb-1.5">Término de búsqueda</label>
                    <div className="flex gap-2 flex-wrap">
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="flex-1 min-w-[200px] bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
                        placeholder="ssd, ryzen, monitor..."
                      />
                      <div className="flex gap-1.5">
                        {SUGGESTED_QUERIES.map((q) => (
                          <button
                            key={q}
                            onClick={() => setQuery(q)}
                            className={`text-xs font-medium px-2.5 py-2 rounded-lg border transition-all ${
                              query === q
                                ? "border-brand-500 bg-brand-600/15 text-brand-400"
                                : "border-surface-700 text-surface-400 hover:text-surface-200"
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-surface-400 mb-1.5">Alcance</label>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setScope("configured")}
                        className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                          scope === "configured"
                            ? "border-brand-500 bg-brand-600/15 text-brand-400"
                            : "border-surface-700 text-surface-400 hover:text-surface-200"
                        }`}
                      >
                        Solo proveedores configurados ({configuredProviders.size})
                      </button>
                      <button
                        onClick={() => setScope("all")}
                        className={`flex-1 text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                          scope === "all"
                            ? "border-brand-500 bg-brand-600/15 text-brand-400"
                            : "border-surface-700 text-surface-400 hover:text-surface-200"
                        }`}
                      >
                        Todos los proveedores ({ALL_PROVIDERS.length})
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={runAll}
                      disabled={runningAll || !query.trim() || loadingCreds}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
                    >
                      {runningAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      {runningAll ? "Ejecutando…" : "Ejecutar test"}
                    </button>
                    <button
                      onClick={clearAll}
                      disabled={runningAll}
                      className="flex items-center gap-1.5 border border-surface-700 hover:border-surface-500 text-surface-400 hover:text-white text-xs rounded-lg px-4 py-2.5 transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Limpiar
                    </button>
                  </div>
                </div>
              </section>

              {/* Summary */}
              {tested + summary.running > 0 && (
                <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <SummaryCard label="OK" count={summary.ok} color="emerald" icon={CheckCircle2} />
                  <SummaryCard label="Vacíos" count={summary.empty} color="yellow" icon={Minus} />
                  <SummaryCard label="Errores" count={summary.error} color="red" icon={XCircle} />
                  <SummaryCard label="Sin credencial" count={summary.no_cred} color="surface" icon={AlertTriangle} />
                </section>
              )}

              {/* Results table */}
              <section className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-surface-800 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Resultados por proveedor</h2>
                  {tested > 0 && <span className="text-xs text-surface-500">{tested} de {scope === "configured" ? configuredProviders.size : ALL_PROVIDERS.length} testeado{tested !== 1 ? "s" : ""}</span>}
                </div>

                <div className="divide-y divide-surface-800">
                  {ALL_PROVIDERS
                    .filter((p) => scope === "all" || configuredProviders.has(p) || results[p])
                    .map((p) => {
                      const result = results[p];
                      const configured = configuredProviders.has(p);
                      return (
                        <ProviderRow
                          key={p}
                          provider={p}
                          result={result}
                          configured={configured}
                          expanded={expanded.has(p)}
                          onToggle={() => toggleExpand(p)}
                          onTest={() => testProvider(p)}
                        />
                      );
                    })}
                </div>
              </section>

              {/* Help */}
              <section className="bg-surface-900/50 border border-surface-800 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-3">¿Qué significa cada estado?</h3>
                <ul className="grid sm:grid-cols-2 gap-2 text-xs text-surface-400">
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" /><span><strong className="text-emerald-400">OK:</strong> proveedor respondió con productos</span></li>
                  <li className="flex items-start gap-2"><Minus className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" /><span><strong className="text-yellow-400">Vacío:</strong> respondió pero sin resultados para ese término</span></li>
                  <li className="flex items-start gap-2"><XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" /><span><strong className="text-red-400">Error:</strong> el back o el proveedor devolvieron un error</span></li>
                  <li className="flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 text-surface-500 mt-0.5 flex-shrink-0" /><span><strong className="text-surface-400">Sin credencial:</strong> falta cargar la cuenta en Proveedores → Mi cuenta</span></li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

function SummaryCard({ label, count, color, icon: Icon }: {
  label: string; count: number; color: string; icon: React.ElementType;
}) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    yellow: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    surface: "text-surface-400 bg-surface-800 border-surface-700",
  };
  return (
    <div className={`border rounded-xl p-3 flex items-center gap-3 ${colors[color]}`}>
      <Icon className="w-5 h-5" />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
        <p className="text-xl font-bold tabular-nums">{count}</p>
      </div>
    </div>
  );
}

function ProviderRow({ provider, result, configured, expanded, onToggle, onTest }: {
  provider: Provider; result?: ProviderResult; configured: boolean; expanded: boolean; onToggle: () => void; onTest: () => void;
}) {
  const status = result?.status || "idle";
  const StatusIcon = {
    idle: Package,
    running: Loader2,
    ok: CheckCircle2,
    empty: Minus,
    error: XCircle,
    no_cred: AlertTriangle,
  }[status];
  const statusColor = {
    idle: "text-surface-600",
    running: "text-brand-400",
    ok: "text-emerald-400",
    empty: "text-yellow-400",
    error: "text-red-400",
    no_cred: "text-surface-500",
  }[status];
  const statusLabel = {
    idle: "Sin testear",
    running: "Testeando…",
    ok: "OK",
    empty: "Vacío",
    error: "Error",
    no_cred: "Sin credencial",
  }[status];

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-800/50 transition-colors">
        <button onClick={onToggle} className="text-surface-600 hover:text-white flex-shrink-0" disabled={!result || status === "running"}>
          {result && status !== "running" ? (expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <span className="w-3.5 h-3.5" />}
        </button>

        <StatusIcon className={`w-4 h-4 flex-shrink-0 ${statusColor} ${status === "running" ? "animate-spin" : ""}`} />

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${PROVIDER_COLOR[provider] || "text-surface-300"}`}>
            {provider.replace(/_/g, " ")}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-surface-500">{statusLabel}</span>
            {configured && (
              <span className="text-[9px] text-emerald-400 font-medium">● configurado</span>
            )}
            {!configured && (
              <span className="text-[9px] text-surface-600">○ sin credencial</span>
            )}
          </div>
        </div>

        {result?.duration != null && (
          <div className="flex items-center gap-1 text-[11px] text-surface-500 tabular-nums">
            <Clock className="w-3 h-3" />
            {result.duration}ms
          </div>
        )}

        {result?.count != null && (
          <span className="text-xs font-semibold text-surface-200 tabular-nums min-w-[3rem] text-right">
            {result.count} {result.count === 1 ? "prod." : "prods."}
          </span>
        )}

        <button
          onClick={onTest}
          disabled={status === "running"}
          className="text-xs font-medium border border-surface-700 hover:border-surface-500 text-surface-300 hover:text-white rounded-md px-2.5 py-1.5 transition-all disabled:opacity-50"
        >
          {status === "running" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Testear"}
        </button>
      </div>

      {expanded && result && (
        <div className="px-4 pb-3 pl-12 text-xs">
          {result.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-300 font-mono">
              {result.error}
            </div>
          )}
          {result.sample && result.sample.length > 0 && (
            <div className="bg-surface-800/50 border border-surface-700 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-surface-500 uppercase mb-2">Muestra de productos</p>
              <ul className="flex flex-col gap-1.5">
                {result.sample.map((s, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span className="text-surface-300 line-clamp-1">{s.name}</span>
                    <span className="text-emerald-400 font-semibold tabular-nums flex-shrink-0">${s.price}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.status === "empty" && (
            <p className="text-surface-500 text-[11px]">
              El proveedor respondió pero no devolvió productos para este término. Probá con otro término o revisá la integración del back.
            </p>
          )}
          {result.status === "no_cred" && (
            <p className="text-surface-500 text-[11px]">
              No hay credencial configurada. Andá a <Link href="/proveedores" className="text-brand-400 hover:underline">Proveedores</Link> para agregarla.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
