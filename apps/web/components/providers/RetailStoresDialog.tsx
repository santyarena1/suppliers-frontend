"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, Loader2, Search, Store, X } from "lucide-react";
import { apiError } from "@/lib/storefront";
import { invalidateMyProviders, retailSuppliersApi, type RetailStoreOption } from "@/lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

/**
 * Sumar como proveedor un local de los que NODO lee (HardGamers, Compra Gamer...).
 * Sus precios son los que publica, en pesos con IVA; después se le cargan los
 * descuentos (general, por categoría o por marca) desde su ficha.
 */
export default function RetailStoresDialog({ open, onClose, onChanged }: Props) {
  const [q, setQ] = useState("");
  const [stores, setStores] = useState<RetailStoreOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(() => {
      retailSuppliersApi
        .list(q)
        .then((res) => !cancelled && setStores(res.data))
        .catch((err) => !cancelled && setError(apiError(err, "No se pudieron cargar los locales")));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, q]);

  if (!open || typeof document === "undefined") return null;

  async function toggle(store: RetailStoreOption) {
    setBusy(store.id);
    setError(null);
    setNotice(null);
    try {
      if (store.connected) await retailSuppliersApi.disconnect(store.id);
      else {
        const res = await retailSuppliersApi.connect(store.id);
        setNotice(
          res.data.preparing
            ? `Listo. Estamos copiando el catálogo de ${store.name}: en un par de minutos lo ves en la búsqueda.`
            : `Listo: ${store.name} ya está entre tus proveedores.`
        );
      }
      invalidateMyProviders();
      const res = await retailSuppliersApi.list(q);
      setStores(res.data);
      onChanged?.();
    } catch (err) {
      setError(apiError(err, store.connected ? "No se pudo quitar el local" : "No se pudo sumar el local"));
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-surface-950 border border-surface-800 rounded-2xl shadow-2xl flex flex-col max-h-[90dvh]"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-surface-800">
          <div>
            <h2 className="text-sm font-semibold text-white">Sumar un local como proveedor</h2>
            <p className="text-xs text-surface-400 mt-1">
              Locales que NODO lee de HardGamers y Compra Gamer. Ves su precio publicado (en pesos, con IVA) menos el
              descuento que le cargues.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-surface-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3">
          <div className="relative">
            <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar local…"
              className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
            />
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          {notice && <p className="text-xs text-emerald-400 mt-2">{notice}</p>}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {stores === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
            </div>
          ) : stores.length === 0 ? (
            <p className="text-xs text-surface-500 py-6 text-center">No hay locales con ese nombre.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-surface-800">
              {stores.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logoUrl} alt="" className="w-8 h-8 rounded-md object-contain bg-white/5 flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-md bg-surface-800 flex items-center justify-center flex-shrink-0">
                      <Store className="w-4 h-4 text-surface-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate flex items-center gap-1.5">
                      {s.name}
                      {s.connected && <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-label="Sumado" />}
                    </p>
                    <p className="text-[11px] text-surface-500">
                      {s.products.toLocaleString("es-AR")} productos
                      {s.connected && s.discountPercent ? ` · ${s.discountPercent} % de descuento general` : ""}
                    </p>
                  </div>
                  {s.connected && s.provider && (
                    <Link
                      href={`/proveedores/${s.provider}?tab=descuentos`}
                      onClick={onClose}
                      className="text-[11px] text-brand-400 hover:text-brand-300 whitespace-nowrap"
                    >
                      Descuentos
                    </Link>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void toggle(s)}
                    className={
                      s.connected
                        ? "flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 border border-surface-700 text-surface-300 hover:text-white hover:border-red-500/60 disabled:opacity-50"
                        : "flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
                    }
                    title={s.connected ? "Quitar este local de tus proveedores" : undefined}
                  >
                    {busy === s.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : s.connected ? (
                      "Quitar"
                    ) : (
                      "Sumar"
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
