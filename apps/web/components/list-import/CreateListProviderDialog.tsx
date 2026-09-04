"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { invalidateMyProviders, listImportsApi, type MissingProductAction, type ZeroStockAction } from "@/lib/api";

const CADENCE_OPTIONS = [
  { days: 7, label: "Cada semana" },
  { days: 15, label: "Cada 15 días" },
  { days: 30, label: "Cada mes" },
  { days: 0, label: "Sin cadencia fija" },
];

const MISSING_LABELS: Record<MissingProductAction, string> = {
  KEEP: "No hacer nada",
  OUT_OF_STOCK: "Marcar sin stock",
  HIDE: "Ocultar del catálogo",
  DELETE: "Eliminar de nuestra base",
};

const ZERO_STOCK_LABELS: Record<ZeroStockAction, string> = {
  KEEP: "Mostrar igual",
  HIDE: "Ocultar del catálogo",
  DELETE: "Eliminar de nuestra base",
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Un comercio configura además cómo le compra (markup, faltantes…). */
  showPurchaseConfig: boolean;
  initialName?: string;
  initialType?: "DISTRIBUTOR" | "BRAND";
  onCreated?: () => void;
};

/**
 * Alta de un distribuidor o marca que manda su lista por planilla. La clave del
 * proveedor la genera el backend a partir del nombre.
 */
export default function CreateListProviderDialog({ open, onClose, showPurchaseConfig, initialName, initialType, onCreated }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [type, setType] = useState<"DISTRIBUTOR" | "BRAND">(initialType ?? "DISTRIBUTOR");

  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setType(initialType ?? "DISTRIBUTOR");
    }
  }, [open, initialName, initialType]);
  const [days, setDays] = useState(15);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [markup, setMarkup] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [missing, setMissing] = useState<MissingProductAction>("KEEP");
  const [zeroStock, setZeroStock] = useState<ZeroStockAction>("KEEP");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await listImportsApi.createProvider({
        name: name.trim(),
        type,
        listUpdateDays: days > 0 ? days : null,
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        config: showPurchaseConfig
          ? {
              priceMarkupPercent: Number(markup) || 0,
              minStockThreshold: Number(minStock) || 0,
              missingProductAction: missing,
              zeroStockAction: zeroStock,
            }
          : undefined,
      });
      invalidateMyProviders();
      onCreated?.();
      onClose();
      router.push(`/proveedores/${res.data.providerKey}?tab=lists`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(". ") : msg || "No se pudo crear el proveedor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-surface-950 border border-surface-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Nuevo proveedor por lista</h2>
            <p className="text-xs text-surface-500 mt-0.5">Para distribuidores o marcas que mandan su lista por WhatsApp o mail.</p>
          </div>
          <button type="button" onClick={onClose} className="text-surface-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1.5">Nombre comercial</label>
            <input
              autoFocus
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Acústica Río"
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "DISTRIBUTOR" | "BRAND")}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
              >
                <option value="DISTRIBUTOR">Distribuidor</option>
                <option value="BRAND">Marca</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">Cada cuánto llega la lista</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
              >
                {CADENCE_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">Mail de contacto</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">Teléfono / WhatsApp</label>
              <input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {showPurchaseConfig && (
            <div className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-surface-300">Cómo le comprás</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-surface-400 mb-1">Markup (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={markup}
                    onChange={(e) => setMarkup(e.target.value)}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-400 mb-1">Stock mínimo</label>
                  <input
                    type="number"
                    min={0}
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-400 mb-1">Producto que deja de venir</label>
                  <select
                    value={missing}
                    onChange={(e) => setMissing(e.target.value as MissingProductAction)}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    {(Object.keys(MISSING_LABELS) as MissingProductAction[]).map((k) => (
                      <option key={k} value={k}>{MISSING_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-400 mb-1">Producto con stock 0</label>
                  <select
                    value={zeroStock}
                    onChange={(e) => setZeroStock(e.target.value as ZeroStockAction)}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    {(Object.keys(ZERO_STOCK_LABELS) as ZeroStockAction[]).map((k) => (
                      <option key={k} value={k}>{ZERO_STOCK_LABELS[k]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-surface-500">Offline, esquema e IVA se configuran después, en la pestaña Configuración del proveedor.</p>
            </div>
          )}

          {error && <p className="text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-surface-800 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm text-surface-400 hover:text-white px-3 py-2">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || name.trim().length < 2}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-4 py-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Crear y subir lista
          </button>
        </div>
      </form>
    </div>
  );
}
