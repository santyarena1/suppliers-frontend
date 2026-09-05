"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { providerLabel } from "@/components/ProviderBadge";
import {
  ALL_PROVIDERS,
  PROVIDER_LABELS,
  assetsApi,
  imageSyncApi,
  type ImageSyncFill,
  type ImageSyncMissingItem,
  type ImageSyncStatus,
  type Provider,
  type SerperImageHit,
} from "@/lib/api";
import { assetUrl } from "@/lib/assets";
import { proxyImg } from "@/lib/format";
import ImageUploadPreviewModal from "@/components/ImageUploadPreviewModal";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Play,
  Search,
  Square,
  Upload,
} from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

function thumb(url: string | null | undefined) {
  if (!url) return "";
  if (url.startsWith("/assets/") || url.startsWith("/uploads/")) return assetUrl(url);
  return proxyImg(url, { trim: false });
}

function productHref(provider: string, externalId: string) {
  return `/product/${encodeURIComponent(provider)}/${encodeURIComponent(externalId)}`;
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SOURCE_LABEL: Record<string, string> = {
  serper: "Primera foto",
  serper_pick: "Elegida",
  upload: "Subida",
};

const STATUS_LABEL: Record<string, string> = {
  filled: "Con foto",
  skipped: "Sin resultado",
  failed: "Error",
};

export default function ImageSyncPanel({
  showToast,
}: {
  showToast: (m: string, ok?: boolean) => void;
}) {
  const [status, setStatus] = useState<ImageSyncStatus | null>(null);
  const [missing, setMissing] = useState<ImageSyncMissingItem[]>([]);
  const [problems, setProblems] = useState<ImageSyncFill[]>([]);
  const [problemsTotal, setProblemsTotal] = useState(0);
  const [history, setHistory] = useState<ImageSyncFill[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [histStatus, setHistStatus] = useState("");
  const [histQ, setHistQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [provider, setProvider] = useState<string>("");
  const [picker, setPicker] = useState<ImageSyncFill | ImageSyncMissingItem | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const take = 20;

  const load = useCallback(async () => {
    try {
      const [st, miss, probs, hist] = await Promise.all([
        imageSyncApi.status(),
        imageSyncApi.missing({ take: 8, provider: provider || undefined }),
        imageSyncApi.history({
          page: 1,
          take: 40,
          provider: provider || undefined,
          status: "problems",
        }),
        imageSyncApi.history({
          page,
          take,
          provider: provider || undefined,
          status: histStatus || undefined,
          q: histQ.trim() || undefined,
        }),
      ]);
      setStatus(st.data);
      setMissing(miss.data.items);
      setProblems(probs.data.items);
      setProblemsTotal(probs.data.total);
      setHistory(hist.data.items);
      setHistoryTotal(hist.data.total);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [provider, page, histStatus, histQ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!status?.running) return;
    const id = setInterval(() => void load(), 2500);
    return () => clearInterval(id);
  }, [status?.running, load]);

  async function toggleCron() {
    if (!status) return;
    try {
      const next = !status.cronEnabled;
      await imageSyncApi.setCron(next);
      showToast(next ? "Cron activado: 8:00 y 20:00" : "Cron desactivado");
      await load();
    } catch (err) {
      showToast(errMsg(err, "No se pudo cambiar el cron"), false);
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

  async function applyImage(productId: string, imageUrl: string, source: "serper_pick" | "upload") {
    await imageSyncApi.setImage(productId, imageUrl, source);
    showToast("Foto actualizada");
    setPicker(null);
    await load();
  }

  async function confirmUpload(file: File) {
    if (!uploadFor) return;
    setUploading(true);
    try {
      const { url } = await assetsApi.upload(file);
      await applyImage(uploadFor, url, "upload");
      setDraftFile(null);
      setUploadFor(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo subir", false);
    } finally {
      setUploading(false);
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
  const pages = Math.max(1, Math.ceil(historyTotal / take));
  const pct =
    runRow && runRow.missingTotal > 0
      ? Math.min(100, Math.round((runRow.processed / Math.max(runRow.maxItems ?? runRow.missingTotal, 1)) * 100))
      : running
        ? 5
        : 0;

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-semibold text-white">Sincronización de imágenes</h2>
        <p className="text-xs text-surface-500 mt-1">
          Solo productos sin foto. Primera foto busca en Serper, prueba que la imagen cargue y la guarda
          en Nodo. Si falla la API o no hay créditos, el producto queda pendiente (no se marca como listo).
          También reintenta los que salieron “sin resultado” o con error. El automático corre dos veces al
          día (~{status?.cronLimit ?? 200} por corrida).
        </p>
      </div>

      {!status?.hasSerperKey && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 text-sm text-amber-200">
          <KeyRound className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 min-w-[200px]">
            Falta la API key de Serper. Cargala en Configuración → Credenciales API.
          </span>
          <Link
            href="/configuracion?tab=credentials"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100"
          >
            Ir a credenciales
          </Link>
        </div>
      )}

      <div className="border border-surface-800 rounded-xl p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex gap-6">
            <div>
              <p className="text-2xl font-semibold text-white tabular-nums">{status?.missing ?? "—"}</p>
              <p className="text-xs text-surface-500">sin imagen</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white tabular-nums">{status?.pendingVisible ?? "—"}</p>
              <p className="text-xs text-surface-500">en catálogo con stock</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white tabular-nums">{status?.pendingDeferred ?? "—"}</p>
              <p className="text-xs text-surface-500">sin stock / ocultos</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-white tabular-nums">{status?.filled ?? "—"}</p>
              <p className="text-xs text-surface-500">completadas</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-amber-300 tabular-nums">{status?.problems ?? "—"}</p>
              <p className="text-xs text-surface-500">con error / sin foto</p>
            </div>
          </div>
          <label className="text-xs text-surface-500">
            Distribuidor
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setPage(1);
              }}
              className="mt-1 block bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-sm text-white"
            >
              <option value="">Todos</option>
              {(status?.byProvider?.length
                ? status.byProvider.map((b) => b.provider)
                : ALL_PROVIDERS
              ).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p as Provider] ?? providerLabel(p)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-start gap-2.5 text-sm text-surface-200 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(status?.cronEnabled)}
            onChange={() => void toggleCron()}
            className="mt-0.5"
          />
          <span>
            Correr solo, 2 veces por día
            <span className="block text-xs text-surface-500">
              {status?.cronHourHint ?? "8:00 y 20:00 (Argentina)"} · hasta {status?.cronLimit ?? 200} productos por
              corrida (tandas de 50). Primero los que se ven con stock; sin stock u ocultos quedan para después, solos.
            </span>
          </span>
        </label>

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
              {runRow.source === "cron" ? " · automático" : " · manual"}
              {" · "}
              {runRow.updated} fotos · {runRow.skipped} sin resultado · {runRow.failed} error
              {runRow.processed > 0 ? ` · ${runRow.processed} procesados` : ""}
            </p>
            {runRow.errorMessage && <p className="text-xs text-red-400">{runRow.errorMessage}</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void run(false)}
            disabled={starting || running || !status?.hasSerperKey || (status?.pending ?? 0) === 0}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-3 py-2"
          >
            {starting || running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Primera foto
          </button>
          <button
            type="button"
            onClick={() => void run(true)}
            disabled={starting || running || !status?.hasSerperKey || (status?.pending ?? 0) === 0}
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

      <section className="border border-amber-500/25 bg-amber-500/[0.04] rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-amber-100">
            Con error / sin resultado
            <span className="ml-2 text-xs font-normal text-amber-200/70 tabular-nums">
              {status?.problems ?? problemsTotal}
            </span>
          </h3>
        </div>
        <p className="text-xs text-surface-500 mb-3">
          Productos donde Serper falló o no devolvió una foto usable. Quedan pendientes para reintentar;
          también podés elegir otra imagen o subirla.
        </p>
        {problems.length === 0 ? (
          <p className="text-sm text-surface-500">No hay productos con error por ahora.</p>
        ) : (
          <>
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {problems.map((row) => (
                <FillRow
                  key={`prob-${row.id}`}
                  row={row}
                  onPick={() => setPicker(row)}
                  onUpload={() => {
                    setUploadFor(row.productId);
                    fileRef.current?.click();
                  }}
                />
              ))}
            </ul>
            {problemsTotal > problems.length && (
              <p className="text-xs text-surface-500 mt-3">
                Mostrando {problems.length} de {problemsTotal}. Filtrá el historial por “Sin resultado” o “Error” para ver el resto.
              </p>
            )}
          </>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-white">Historial</h3>
          <div className="flex flex-wrap gap-2">
            <input
              value={histQ}
              onChange={(e) => {
                setHistQ(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar producto…"
              className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-surface-500 w-44"
            />
            <select
              value={histStatus}
              onChange={(e) => {
                setHistStatus(e.target.value);
                setPage(1);
              }}
              className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-1.5 text-sm text-white"
            >
              <option value="">Todos</option>
              <option value="problems">Con error / sin resultado</option>
              <option value="filled">Con foto</option>
              <option value="skipped">Sin resultado</option>
              <option value="failed">Error</option>
            </select>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-surface-500">Todavía no hay movimientos. Corré Primera foto o esperá el cron.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {history.map((row) => (
              <FillRow
                key={row.id}
                row={row}
                onPick={() => setPicker(row)}
                onUpload={() => {
                  setUploadFor(row.productId);
                  fileRef.current?.click();
                }}
              />
            ))}
          </ul>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between mt-3 text-sm text-surface-400">
            <span>
              {historyTotal} ítems · pág. {page}/{pages}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 border border-surface-700 rounded disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 border border-surface-700 rounded disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {missing.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-surface-500 mb-2">
            Pendientes (muestra · primero con stock)
          </h3>
          <ul className="flex flex-col gap-1.5">
            {missing.map((it) => (
              <li key={it.id} className="border border-surface-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-surface-200 line-clamp-1">{it.name}</p>
                  <p className="text-[11px] text-surface-500 font-mono truncate">
                    {PROVIDER_LABELS[it.provider as Provider] ?? it.provider} · {it.query}
                    {it.inCatalog === false ? " · después" : ""}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setPicker(it)}
                    className="text-[11px] text-brand-300 border border-brand-500/30 rounded px-1.5 py-0.5"
                  >
                    Serper
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadFor(it.id);
                      fileRef.current?.click();
                    }}
                    className="text-[11px] text-surface-400 border border-surface-700 rounded px-1.5 py-0.5"
                  >
                    Subir
                  </button>
                  <a
                    href={productHref(it.provider, it.externalId)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-surface-400 border border-surface-700 rounded px-1.5 py-0.5"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver ficha
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setDraftFile(f);
          e.target.value = "";
        }}
      />
      {draftFile && (
        <ImageUploadPreviewModal
          file={draftFile}
          uploading={uploading}
          onCancel={() => {
            if (!uploading) {
              setDraftFile(null);
              setUploadFor(null);
            }
          }}
          onConfirm={confirmUpload}
        />
      )}
      {picker && (
        <SerperPicker
          productId={"productId" in picker ? picker.productId : picker.id}
          name={picker.name}
          provider={picker.provider}
          externalId={picker.externalId}
          initialQuery={picker.query}
          onClose={() => setPicker(null)}
          onPick={(url) => void applyImage("productId" in picker ? picker.productId : picker.id, url, "serper_pick")}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function SerperPicker({
  productId,
  name,
  provider,
  externalId,
  initialQuery,
  onClose,
  onPick,
  showToast,
}: {
  productId: string;
  name: string;
  provider: string;
  externalId: string;
  initialQuery: string;
  onClose: () => void;
  onPick: (url: string) => void;
  showToast: (m: string, ok?: boolean) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<SerperImageHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<string | null>(null);

  const search = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const r = await imageSyncApi.serperSearch(productId, q.trim() || undefined);
        setQuery(r.data.query);
        setHits(r.data.images);
      } catch (err) {
        showToast(errMsg(err, "No se pudo buscar en Serper"), false);
        setHits([]);
      } finally {
        setLoading(false);
      }
    },
    [productId, showToast]
  );

  useEffect(() => {
    void search(initialQuery);
  }, [search, initialQuery]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-surface-900 border border-surface-700 rounded-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-white line-clamp-2">{name}</h3>
          <a
            href={productHref(provider, externalId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 flex-shrink-0 text-[11px] text-surface-300 hover:text-white border border-surface-700 rounded px-1.5 py-0.5"
          >
            <ExternalLink className="w-3 h-3" />
            Ver ficha
          </a>
        </div>
        <form
          className="flex gap-2 mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void search(query);
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white"
          />
          <button type="submit" className="bg-brand-600 hover:bg-brand-500 text-white text-sm rounded-lg px-3 py-2">
            Buscar
          </button>
        </form>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        ) : hits.length === 0 ? (
          <p className="text-sm text-surface-500 mt-6">No hubo resultados. Probá otro texto.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-4">
            {hits.map((hit) => (
              <PickerHit
                key={hit.imageUrl}
                hit={hit}
                picking={picking}
                onPick={() => {
                  setPicking(hit.imageUrl);
                  onPick(hit.imageUrl);
                }}
              />
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} className="mt-4 text-sm text-surface-400 hover:text-white">
          Cerrar
        </button>
      </div>
    </div>
  );
}

function FillRow({
  row,
  onPick,
  onUpload,
}: {
  row: ImageSyncFill;
  onPick: () => void;
  onUpload: () => void;
}) {
  return (
    <li className="border border-surface-800 rounded-xl p-3 flex gap-3 items-start bg-surface-950/40">
      <div className="w-16 h-16 rounded-md bg-white overflow-hidden flex-shrink-0 relative border border-surface-800">
        {row.imageUrl ? (
          <SafeThumb url={row.imageUrl} />
        ) : (
          <ImageIcon className="w-5 h-5 text-surface-400 absolute inset-0 m-auto" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-surface-100 line-clamp-2">{row.name}</p>
        <p className="text-[11px] text-surface-500 mt-0.5">
          {PROVIDER_LABELS[row.provider as Provider] ?? row.provider} · {STATUS_LABEL[row.status] ?? row.status}
          {row.source ? ` · ${SOURCE_LABEL[row.source] ?? row.source}` : ""} · {fmtWhen(row.updatedAt)}
        </p>
        {row.error && row.status !== "filled" && (
          <p className="text-[11px] text-amber-400/90 mt-0.5">{row.error}</p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <button
            type="button"
            onClick={onPick}
            className="inline-flex items-center gap-1 text-[11px] text-brand-300 hover:text-white border border-brand-500/30 rounded px-1.5 py-0.5"
          >
            <Search className="w-3 h-3" />
            Otra en Serper
          </button>
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex items-center gap-1 text-[11px] text-surface-300 hover:text-white border border-surface-700 rounded px-1.5 py-0.5"
          >
            <Upload className="w-3 h-3" />
            Subir de la PC
          </button>
          <a
            href={productHref(row.provider, row.externalId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-surface-300 hover:text-white border border-surface-700 rounded px-1.5 py-0.5"
          >
            <ExternalLink className="w-3 h-3" />
            Ver ficha
          </a>
        </div>
      </div>
    </li>
  );
}

function SafeThumb({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return <ImageIcon className="w-5 h-5 text-surface-400 absolute inset-0 m-auto" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumb(url)} alt="" className="w-full h-full object-contain p-0.5" onError={() => setBroken(true)} />
  );
}

function PickerHit({
  hit,
  picking,
  onPick,
}: {
  hit: SerperImageHit;
  picking: string | null;
  onPick: () => void;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <button
      type="button"
      disabled={Boolean(picking)}
      onClick={onPick}
      className="border border-surface-700 hover:border-brand-500 rounded-lg overflow-hidden bg-white aspect-square relative"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb(hit.thumbnailUrl || hit.imageUrl)}
        alt=""
        className="w-full h-full object-contain p-1"
        onError={() => setBroken(true)}
      />
      {picking === hit.imageUrl && (
        <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
        </span>
      )}
      {hit.source && (
        <span className="absolute bottom-0 inset-x-0 text-[10px] bg-black/60 text-white px-1 py-0.5 truncate">
          {hit.source}
        </span>
      )}
    </button>
  );
}
