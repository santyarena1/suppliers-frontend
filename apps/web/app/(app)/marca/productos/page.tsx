"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PrefsPanel from "@/components/PrefsPanel";
import {
  ALL_PROVIDERS,
  PROVIDER_LABELS,
  brandApi,
  type BrandCatalogProduct,
  type BrandSignalLight,
  type BrandSkuSignal,
} from "@/lib/api";
import {
  SIGNAL_LIGHT_CARD,
  SIGNAL_LIGHT_DOT,
  SIGNAL_LIGHT_LABELS,
  SIGNAL_LIGHTS,
} from "@/lib/brand-lights";
import { assetUrl } from "@/lib/assets";
import {
  CircleDot,
  Download,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

const CSV_TEMPLATE = `provider,externalId,sku,light,precio_sugerido,notes
NEW_BYTES,12345,GV-FOO,GREEN,199.00,Empujar en góndola
ELIT,ABC-9,,YELLOW,,Consultar ingreso
`;

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function toLocalDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BrandProductosPage() {
  const [signals, setSignals] = useState<BrandSkuSignal[]>([]);
  const [catalog, setCatalog] = useState<BrandCatalogProduct[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState<string>("");
  const [lightFilter, setLightFilter] = useState<BrandSignalLight | "ALL">("ALL");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSignals = useCallback(async () => {
    const res = await brandApi.signals();
    setSignals(res.data.signals);
    setCanWrite(res.data.canWrite);
  }, []);

  const searchCatalog = useCallback(async (term: string, prov: string) => {
    setSearching(true);
    try {
      const res = await brandApi.catalog({
        q: term.trim() || undefined,
        provider: prov || undefined,
        take: 60,
      });
      setCatalog(res.data.products);
      setCanWrite(res.data.canWrite);
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo buscar en los distros") });
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadSignals(), searchCatalog("", "")])
      .catch((err) => setAviso({ ok: false, text: errMsg(err, "No se pudo cargar el mapa") }))
      .finally(() => setLoading(false));
  }, [loadSignals, searchCatalog]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void searchCatalog(q, provider);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, provider, searchCatalog]);

  const counts = useMemo(() => {
    const out = Object.fromEntries(SIGNAL_LIGHTS.map((l) => [l, 0])) as Record<BrandSignalLight, number>;
    for (const row of signals) out[row.light] += 1;
    return out;
  }, [signals]);

  const visible = useMemo(
    () => (lightFilter === "ALL" ? signals : signals.filter((s) => s.light === lightFilter)),
    [signals, lightFilter]
  );

  async function addToMap(product: BrandCatalogProduct) {
    if (!canWrite || product.selected) return;
    setSavingId(`${product.provider}:${product.externalId}`);
    try {
      await brandApi.upsertSignal({
        provider: product.provider,
        externalId: product.externalId,
        light: "YELLOW",
      });
      await loadSignals();
      setCatalog((prev) =>
        prev.map((p) =>
          p.provider === product.provider && p.externalId === product.externalId ? { ...p, selected: true } : p
        )
      );
      setAviso({ ok: true, text: "Sumado al mapa" });
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo sumar") });
    } finally {
      setSavingId(null);
    }
  }

  async function patchSignal(row: BrandSkuSignal, patch: Partial<BrandSkuSignal>) {
    if (!canWrite) return;
    setSavingId(row.id);
    try {
      const res = await brandApi.upsertSignal({
        provider: row.provider,
        externalId: row.externalId,
        light: patch.light ?? row.light,
        suggestedPrice: patch.suggestedPrice === undefined ? row.suggestedPrice : patch.suggestedPrice,
        qtyEstimate: patch.qtyEstimate === undefined ? row.qtyEstimate : patch.qtyEstimate,
        incomingAt: patch.incomingAt === undefined ? row.incomingAt : patch.incomingAt,
        notes: patch.notes === undefined ? row.notes : patch.notes,
      });
      setSignals((prev) => prev.map((s) => (s.id === row.id ? res.data : s)));
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo guardar el semáforo") });
    } finally {
      setSavingId(null);
    }
  }

  async function remove(id: string) {
    if (!canWrite) return;
    setSavingId(id);
    try {
      await brandApi.removeSignal(id);
      const gone = signals.find((s) => s.id === id);
      setSignals((prev) => prev.filter((s) => s.id !== id));
      if (gone) {
        setCatalog((prev) =>
          prev.map((p) =>
            p.provider === gone.provider && p.externalId === gone.externalId ? { ...p, selected: false } : p
          )
        );
      }
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo sacar del mapa") });
    } finally {
      setSavingId(null);
    }
  }

  function exportCsv() {
    const header = "provider,externalId,sku,light,precio_sugerido,notes";
    const lines = signals.map((s) =>
              [s.provider, s.externalId, s.sku ?? "", s.light, s.suggestedPrice ?? "", (s.notes ?? "").split('"').join('""')]
        .map((v) => `"${v}"`)
        .join(",")
    );
    downloadText("mapa-marca.csv", [header, ...lines].join("\n"));
  }

  async function onImportFile(file: File) {
    setImporting(true);
    try {
      const csv = await file.text();
      const res = await brandApi.importSignals(csv);
      await loadSignals();
      await searchCatalog(q, provider);
      setAviso({ ok: true, text: `Importados ${res.data.upserted}. Omitidos ${res.data.skipped}.` });
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo importar el CSV") });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-white">Productos</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            No hay catálogo propio. Elegís SKUs reales de los distros y les ponés semáforo y precio sugerido.
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
          {aviso && (
            <p className={`text-xs rounded-md px-3 py-2 ${aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {aviso.text}
            </p>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {SIGNAL_LIGHTS.map((light) => (
                  <button
                    key={light}
                    type="button"
                    onClick={() => setLightFilter((prev) => (prev === light ? "ALL" : light))}
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      lightFilter === light ? SIGNAL_LIGHT_CARD[light] : "border-surface-800 bg-surface-900"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] text-surface-400">
                      <span className={`w-2 h-2 rounded-full ${SIGNAL_LIGHT_DOT[light]}`} />
                      {SIGNAL_LIGHT_LABELS[light]}
                    </span>
                    <p className="text-lg font-semibold text-white tabular-nums mt-1">{counts[light]}</p>
                  </button>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-5 items-start">
                <section className="border border-surface-800 rounded-xl bg-surface-900 overflow-hidden">
                  <div className="px-4 py-3 border-b border-surface-800">
                    <h2 className="text-sm font-semibold text-white">Catálogo de los distros</h2>
                    <p className="text-[11px] text-surface-500 mt-0.5">
                      Solo SKUs de esta marca. No se ven precios ni stock de cada comercio.
                    </p>
                  </div>
                  <div className="p-3 flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-surface-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Nombre, SKU o código del distro"
                        className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
                      />
                    </div>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-sm text-white"
                    >
                      <option value="">Todos los distros</option>
                      {ALL_PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {PROVIDER_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="max-h-[520px] overflow-y-auto divide-y divide-surface-800">
                    {searching && catalog.length === 0 ? (
                      <div className="flex justify-center py-10">
                        <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                      </div>
                    ) : catalog.length === 0 ? (
                      <p className="text-xs text-surface-500 px-4 py-8 text-center">
                        No hay SKUs de esta marca en la caché de los distros, o el nombre no coincide con el término de
                        catálogo.
                      </p>
                    ) : (
                      catalog.map((product) => (
                        <CatalogRow
                          key={`${product.provider}:${product.externalId}`}
                          product={product}
                          busy={savingId === `${product.provider}:${product.externalId}`}
                          canWrite={canWrite}
                          onAdd={() => void addToMap(product)}
                        />
                      ))
                    )}
                  </div>
                </section>

                <section className="border border-surface-800 rounded-xl bg-surface-900 overflow-hidden">
                  <div className="px-4 py-3 border-b border-surface-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
                        <CircleDot className="w-4 h-4 text-brand-400" /> Mapa comercial
                      </h2>
                      <p className="text-[11px] text-surface-500 mt-0.5">
                        Lo ven los comercios y distros vinculados, en el espacio de la marca.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => downloadText("plantilla-semaforos.csv", CSV_TEMPLATE)}
                        className="text-[11px] border border-surface-700 rounded-lg px-2 py-1 text-surface-300 hover:text-white"
                      >
                        Plantilla
                      </button>
                      <button
                        type="button"
                        onClick={exportCsv}
                        disabled={signals.length === 0}
                        className="text-[11px] border border-surface-700 rounded-lg px-2 py-1 text-surface-300 hover:text-white inline-flex items-center gap-1 disabled:opacity-40"
                      >
                        <Download className="w-3 h-3" /> CSV
                      </button>
                      {canWrite && (
                        <>
                          <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void onImportFile(file);
                            }}
                          />
                          <button
                            type="button"
                            disabled={importing}
                            onClick={() => fileRef.current?.click()}
                            className="text-[11px] border border-brand-500/40 text-brand-300 rounded-lg px-2 py-1 inline-flex items-center gap-1"
                          >
                            {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                            Importar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="max-h-[560px] overflow-y-auto divide-y divide-surface-800">
                    {visible.length === 0 ? (
                      <p className="text-xs text-surface-500 px-4 py-8 text-center">
                        Todavía no hay SKUs en el mapa. Buscá a la izquierda y dale a Sumar.
                      </p>
                    ) : (
                      visible.map((row) => (
                        <SignalEditor
                          key={row.id}
                          row={row}
                          canWrite={canWrite}
                          busy={savingId === row.id}
                          onPatch={(patch) => void patchSignal(row, patch)}
                          onRemove={() => void remove(row.id)}
                        />
                      ))
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function CatalogRow({
  product,
  canWrite,
  busy,
  onAdd,
}: {
  product: BrandCatalogProduct;
  canWrite: boolean;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(product.imageUrl)} alt="" className="w-10 h-10 rounded-md object-contain bg-white/5" />
      ) : (
        <div className="w-10 h-10 rounded-md bg-surface-800" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white truncate">{product.name}</p>
        <p className="text-[11px] text-surface-500 truncate">
          {product.providerName}
          {product.sku ? ` · ${product.sku}` : ` · ${product.externalId}`}
        </p>
      </div>
      {product.selected ? (
        <span className="text-[11px] text-emerald-400">En el mapa</span>
      ) : (
        <button
          type="button"
          disabled={!canWrite || busy}
          onClick={onAdd}
          className="text-[11px] font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Sumar
        </button>
      )}
    </div>
  );
}

function SignalEditor({
  row,
  canWrite,
  busy,
  onPatch,
  onRemove,
}: {
  row: BrandSkuSignal;
  canWrite: boolean;
  busy: boolean;
  onPatch: (patch: Partial<BrandSkuSignal>) => void;
  onRemove: () => void;
}) {
  const [price, setPrice] = useState(row.suggestedPrice != null ? String(row.suggestedPrice) : "");
  const [qty, setQty] = useState(row.qtyEstimate != null ? String(row.qtyEstimate) : "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [incoming, setIncoming] = useState(toLocalDate(row.incomingAt));

  useEffect(() => {
    setPrice(row.suggestedPrice != null ? String(row.suggestedPrice) : "");
    setQty(row.qtyEstimate != null ? String(row.qtyEstimate) : "");
    setNotes(row.notes ?? "");
    setIncoming(toLocalDate(row.incomingAt));
  }, [row.suggestedPrice, row.qtyEstimate, row.notes, row.incomingAt]);

  return (
    <div className={`px-4 py-3 ${SIGNAL_LIGHT_CARD[row.light]} border-0 rounded-none`}>
      <div className="flex items-start gap-3">
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(row.imageUrl)} alt="" className="w-10 h-10 rounded-md object-contain bg-black/20" />
        ) : (
          <div className="w-10 h-10 rounded-md bg-black/20" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white truncate">{row.name}</p>
          <p className="text-[11px] text-surface-400 truncate">
            {row.providerName}
            {row.sku ? ` · ${row.sku}` : ` · ${row.externalId}`}
          </p>
        </div>
        {canWrite && (
          <button type="button" onClick={onRemove} disabled={busy} className="text-surface-500 hover:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SIGNAL_LIGHTS.map((light) => (
          <button
            key={light}
            type="button"
            disabled={!canWrite || busy}
            onClick={() => onPatch({ light })}
            title={SIGNAL_LIGHT_LABELS[light]}
            className={`w-6 h-6 rounded-full border ${SIGNAL_LIGHT_DOT[light]} ${
              row.light === light ? "ring-2 ring-white/80 scale-110" : "opacity-50 hover:opacity-100"
            }`}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-surface-400">Precio sugerido</span>
          <input
            inputMode="decimal"
            disabled={!canWrite}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => {
              const n = price.trim() === "" ? null : Number(price.replace(",", "."));
              onPatch({ suggestedPrice: n != null && Number.isFinite(n) ? n : null });
            }}
            className="w-full bg-black/20 border border-white/10 rounded-md px-2 py-1 text-xs text-white"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-surface-400">{row.light === "BLUE" ? "Ingreso" : "Cant. estimada"}</span>
          {row.light === "BLUE" ? (
            <input
              type="date"
              disabled={!canWrite}
              value={incoming}
              onChange={(e) => {
                setIncoming(e.target.value);
                onPatch({ incomingAt: e.target.value ? new Date(`${e.target.value}T12:00:00`).toISOString() : null });
              }}
              className="w-full bg-black/20 border border-white/10 rounded-md px-2 py-1 text-xs text-white"
            />
          ) : (
            <input
              inputMode="numeric"
              disabled={!canWrite}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={() => {
                const n = qty.trim() === "" ? null : Number(qty);
                onPatch({ qtyEstimate: n != null && Number.isFinite(n) ? n : null });
              }}
              className="w-full bg-black/20 border border-white/10 rounded-md px-2 py-1 text-xs text-white"
            />
          )}
        </label>
      </div>
      <label className="block mt-2">
        <span className="text-[10px] text-surface-400">Notas para el local / distro</span>
        <input
          disabled={!canWrite}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (row.notes ?? "")) onPatch({ notes: notes.trim() || null });
          }}
          className="w-full bg-black/20 border border-white/10 rounded-md px-2 py-1 text-xs text-white"
        />
      </label>
    </div>
  );
}
