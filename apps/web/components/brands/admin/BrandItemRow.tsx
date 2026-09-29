"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, Megaphone, Package, Plus, Search, Trash2, X } from "lucide-react";
import { assetUrl } from "@/lib/assets";
import {
  brandApi,
  type BrandAvailabilityItem,
  type BrandCatalogProduct,
  type BrandItemState,
  type BrandStockLevel,
} from "@/lib/api";
import { STOCK_LEVELS, STOCK_STATUS_DOT, STOCK_STATUS_LABEL } from "@/lib/brand-stock";
import { StockChip, formatReferencePrice } from "@/components/brands/BrandAvailability";

export interface BrandItemActions {
  update: (
    id: string,
    data: Partial<{
      name: string;
      referencePrice: number | null;
      currency: string;
      state: BrandItemState | null;
      incomingAt: string | null;
      notes: string | null;
    }>
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  addLink: (id: string, sku: { provider: string; externalId: string }) => Promise<void>;
  setManualLevel: (linkId: string, level: BrandStockLevel | null) => Promise<void>;
  removeLink: (linkId: string) => Promise<void>;
}

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

/** Un producto de la marca: resumen en una línea y edición al desplegar. */
export function BrandItemRow({
  item,
  manual,
  seesExact,
  canWrite,
  actions,
}: {
  item: BrandAvailabilityItem;
  manual: boolean;
  seesExact: boolean;
  canWrite: boolean;
  actions: BrandItemActions;
}) {
  const [open, setOpen] = useState(false);
  const price = formatReferencePrice(item.referencePrice, item.currency);

  return (
    <li className="rounded-2xl border border-surface-800 bg-surface-900/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/[0.02]"
      >
        <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-black/40 overflow-hidden">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(item.imageUrl)} alt="" className="w-full h-full object-contain p-1" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-5 h-5 text-white/25" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{item.name}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {item.state ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-surface-300">
                <span className={`w-1.5 h-1.5 rounded-full ${STOCK_STATUS_DOT[item.state]}`} />
                {STOCK_STATUS_LABEL[item.state]}
              </span>
            ) : item.distributors.length === 0 ? (
              <span className="text-[11px] text-amber-300">Sin distribuidores asociados</span>
            ) : (
              item.distributors.map((d, i) => <StockChip key={`${d.provider}-${i}`} d={d} showStock={seesExact} />)
            )}
          </div>
        </div>
        <span className="hidden sm:block text-right flex-shrink-0">
          <span className="block text-[10px] uppercase tracking-wide text-surface-500">Precio ref.</span>
          <span className={`text-sm tabular-nums ${price ? "text-white font-semibold" : "text-surface-600"}`}>
            {price ?? "—"}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-surface-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <ItemEditor item={item} manual={manual} canWrite={canWrite} actions={actions} />}
    </li>
  );
}

function ItemEditor({
  item,
  manual,
  canWrite,
  actions,
}: {
  item: BrandAvailabilityItem;
  manual: boolean;
  canWrite: boolean;
  actions: BrandItemActions;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.referencePrice == null ? "" : String(item.referencePrice));
  const [currency, setCurrency] = useState(item.currency);
  const [state, setState] = useState<BrandItemState | "">(item.state ?? "");
  const [incomingAt, setIncomingAt] = useState(toDateInput(item.incomingAt));
  const [notes, setNotes] = useState(item.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [busyLink, setBusyLink] = useState<string | null>(null);

  const parsedPrice = price.trim() === "" ? null : Number(price.replace(",", "."));
  const priceOk = parsedPrice === null || (Number.isFinite(parsedPrice) && parsedPrice >= 0);

  async function save() {
    if (!priceOk || !name.trim()) return;
    setSaving(true);
    try {
      await actions.update(item.id, {
        name: name.trim(),
        referencePrice: parsedPrice,
        currency,
        state: state || null,
        incomingAt: state === "INCOMING" && incomingAt ? new Date(`${incomingAt}T12:00:00`).toISOString() : null,
        notes: notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  async function withLink(linkId: string, fn: () => Promise<void>) {
    setBusyLink(linkId);
    try {
      await fn();
    } finally {
      setBusyLink(null);
    }
  }

  const input =
    "w-full rounded-lg border border-surface-700 bg-surface-950 px-2.5 py-1.5 text-sm text-white disabled:opacity-60";

  return (
    <div className="border-t border-surface-800 bg-black/20 p-4 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col gap-3">
        <Field label="Nombre">
          <input className={input} value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Precio de referencia">
            <input
              className={input}
              inputMode="decimal"
              placeholder="Sin precio"
              value={price}
              disabled={!canWrite}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Moneda">
            <select className={input} value={currency} disabled={!canWrite} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </Field>
        </div>
        {!priceOk && <p className="text-[11px] text-red-400">El precio tiene que ser un número.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Estado">
            <select
              className={input}
              value={state}
              disabled={!canWrite}
              onChange={(e) => setState(e.target.value as BrandItemState | "")}
            >
              <option value="">Según stock</option>
              <option value="INCOMING">Próximo ingreso</option>
              <option value="DISCONTINUED">Discontinuado</option>
            </select>
          </Field>
          {state === "INCOMING" && (
            <Field label="Ingresa el">
              <input
                type="date"
                className={input}
                value={incomingAt}
                disabled={!canWrite}
                onChange={(e) => setIncomingAt(e.target.value)}
              />
            </Field>
          )}
        </div>
        {item.state === "INCOMING" && (
          <Link
            href={`/noticias/nueva?tipo=LAUNCH&producto=${item.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 hover:text-sky-200"
          >
            <Megaphone className="w-3.5 h-3.5" />
            Presentar el lanzamiento (fotos, material, aviso)
          </Link>
        )}
        <Field label="Nota interna">
          <textarea
            className={`${input} min-h-[60px]`}
            maxLength={500}
            value={notes}
            disabled={!canWrite}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {canWrite && (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !priceOk || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-40"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Guardar producto
            </button>
            <button
              type="button"
              onClick={() => void actions.remove(item.id)}
              className="inline-flex items-center gap-1 text-xs text-surface-400 hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Quitar producto
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-surface-300 mb-2">
          Distribuidores {manual && <span className="font-normal text-surface-500">· elegí la luz de cada uno</span>}
        </p>
        <ul className="flex flex-col gap-1.5">
          {item.distributors.map((d, i) => (
            <li
              key={d.linkId ?? `${d.provider}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-surface-800 bg-surface-950/60 px-2.5 py-1.5"
            >
              <span className={`w-2 h-2 rounded-full ${STOCK_STATUS_DOT[d.status]}`} />
              <span className="text-xs text-white flex-1 min-w-0 truncate">{d.label}</span>
              {manual && canWrite && d.linkId ? (
                <select
                  className="rounded-md border border-surface-700 bg-surface-950 px-1.5 py-0.5 text-xs text-white"
                  value={d.manualLevel ?? ""}
                  disabled={busyLink === d.linkId}
                  onChange={(e) =>
                    void withLink(d.linkId as string, () =>
                      actions.setManualLevel(d.linkId as string, (e.target.value || null) as BrandStockLevel | null)
                    )
                  }
                >
                  <option value="">Sin dato</option>
                  {STOCK_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {STOCK_STATUS_LABEL[l]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[11px] text-surface-400">
                  {STOCK_STATUS_LABEL[d.status]}
                  {d.stock != null ? ` · ${d.stock} u.` : ""}
                </span>
              )}
              {canWrite && d.linkId && (
                <button
                  type="button"
                  aria-label={`Quitar ${d.label}`}
                  disabled={busyLink === d.linkId}
                  onClick={() => void withLink(d.linkId as string, () => actions.removeLink(d.linkId as string))}
                  className="text-surface-500 hover:text-red-400 disabled:opacity-40"
                >
                  {busyLink === d.linkId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              )}
            </li>
          ))}
          {item.distributors.length === 0 && (
            <li className="text-[11px] text-surface-500">Sumá el código de este producto en cada distribuidor.</li>
          )}
        </ul>
        {canWrite && <AddCode itemName={item.name} onAdd={(sku) => actions.addLink(item.id, sku)} />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-surface-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

/** Buscar un código en los catálogos de los distribuidores y asociarlo al producto. */
function AddCode({
  itemName,
  onAdd,
}: {
  itemName: string;
  onAdd: (sku: { provider: string; externalId: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<BrandCatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      brandApi
        .catalog({ q: q.trim() || itemName, take: 20 })
        .then((res) => setResults(res.data.products))
        .catch(() => setError("No se pudo buscar en los distribuidores"))
        .finally(() => setLoading(false));
    }, 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open, q, itemName]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300"
      >
        <Plus className="w-3.5 h-3.5" />
        Sumar un código de otro distribuidor
      </button>
    );
  }

  async function add(p: BrandCatalogProduct) {
    const key = `${p.provider}:${p.externalId}`;
    setAdding(key);
    try {
      await onAdd({ provider: p.provider, externalId: p.externalId });
      setOpen(false);
    } catch {
      setError("No se pudo sumar ese código");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-surface-700 bg-surface-950 p-2">
      <div className="flex items-center gap-2 px-1">
        <Search className="w-3.5 h-3.5 text-surface-500" />
        <input
          autoFocus
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-surface-600"
          placeholder={`Buscar (por defecto: ${itemName})`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="text-surface-500 hover:text-white">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {error && <p className="px-1 pt-2 text-[11px] text-red-400">{error}</p>}
      <ul className="mt-2 max-h-56 overflow-y-auto">
        {loading ? (
          <li className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
          </li>
        ) : results.length === 0 ? (
          <li className="px-1 py-3 text-[11px] text-surface-500">Sin resultados en los distribuidores.</li>
        ) : (
          results.map((p) => {
            const key = `${p.provider}:${p.externalId}`;
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={adding !== null}
                  onClick={() => void add(p)}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5 disabled:opacity-50"
                >
                  <span className="text-[11px] text-surface-400 w-24 flex-shrink-0 truncate">{p.providerName}</span>
                  <span className="text-xs text-white flex-1 min-w-0 truncate">{p.name}</span>
                  {p.sku && <span className="text-[10px] font-mono text-surface-500">{p.sku}</span>}
                  {adding === key ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Plus className="w-3 h-3 text-brand-400" />
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
