"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, ClipboardList, Loader2, RefreshCw, X } from "lucide-react";
import { storefrontApi, type MyStorefront } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { isRetailerSession } from "@/lib/purchase";
import { ago, apiError, untilText } from "@/lib/storefront";

type StoreView = Extract<MyStorefront, { exists: true }>;
const DISMISS_KEY = "nodo.storefrontBanner.dismissed";
const REFRESH_MS = 10 * 60 * 1000;

/**
 * Aviso arriba de todo para el dueño de una tienda: confirmar el stock cuando se
 * está por vencer (o ya venció) y los pedidos por confirmar. Se puede cerrar;
 * vuelve si cambia lo que avisa.
 */
export default function StorefrontStockBanner() {
  const pathname = usePathname();
  const canManage = useCan("providers.manage");
  const [retailer, setRetailer] = useState(false);
  const [store, setStore] = useState<StoreView | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRetailer(isRetailerSession());
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY));
    } catch {
      /* sin storage */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await storefrontApi.mine();
      setStore(res.data.exists ? res.data : null);
    } catch {
      setStore(null);
    }
  }, []);

  // Al salir de Vender en NODO se vuelve a leer: puede haber confirmado el stock ahí.
  const onVender = Boolean(pathname?.startsWith("/vender"));
  useEffect(() => {
    if (!retailer || !canManage) return;
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [retailer, canManage, load, onVender]);

  if (!store || store.status !== "ACTIVE" || store.productCount === 0) return null;
  const stockDue = store.stockState === "DUE_SOON" || store.stockState === "EXPIRED" || store.stockState === "UNCONFIRMED";
  const orders = store.pendingOrders;
  if (!stockDue && orders === 0) return null;
  // La clave cambia si cambia lo que se avisa: cerrarlo no tapa un aviso nuevo.
  const key = `${store.stockState}:${store.stockConfirmedAt ?? ""}:${orders}`;
  if (dismissed === key) return null;
  // En Vender en NODO ya está todo a la vista.
  if (pathname?.startsWith("/vender")) return null;

  async function confirm() {
    setWorking(true);
    setError(null);
    try {
      const res = await storefrontApi.confirmStock();
      setStore(res.data.exists ? res.data : null);
    } catch (err) {
      setError(apiError(err, "No se pudo confirmar"));
    } finally {
      setWorking(false);
    }
  }

  function close() {
    try {
      sessionStorage.setItem(DISMISS_KEY, key);
    } catch {
      /* sin storage */
    }
    setDismissed(key);
  }

  const expired = store.stockState === "EXPIRED" || store.stockState === "UNCONFIRMED";
  const tone = stockDue && expired ? "border-amber-500/40 bg-amber-500/15 text-amber-50" : "border-sky-500/30 bg-sky-500/10 text-sky-50";

  return (
    <div className={`flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 text-xs ${tone}`} role="status">
      {stockDue && (
        <span className="flex min-w-0 flex-1 basis-72 items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span>
            <b>Tu tienda en NODO:</b>{" "}
            {store.stockState === "DUE_SOON"
              ? `confirmá que el stock está al día (te lo pedimos ${untilText(store.stockExpiresAt) ?? "pronto"}).`
              : store.staleAction === "HIDE"
                ? "el stock venció y tu tienda está oculta. Confirmalo para que vuelva."
                : `el stock está sin confirmar desde ${ago(store.stockConfirmedAt)}. Los compradores lo ven.`}{" "}
            Si vendiste algo por otro lado, actualizalo primero.
          </span>
        </span>
      )}
      {orders > 0 && (
        <Link href="/vender?tab=pedidos" className="inline-flex items-center gap-1.5 font-semibold underline-offset-2 hover:underline">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
          {orders === 1 ? "1 pedido por confirmar" : `${orders} pedidos por confirmar`}
        </Link>
      )}
      <span className="ml-auto flex items-center gap-2">
        {stockDue && (
          <>
            <Link href="/vender?tab=productos" className="rounded-md border border-white/30 px-2.5 py-1 hover:bg-white/10">
              Actualizar productos
            </Link>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={working}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-2.5 py-1 font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Mi stock está al día
            </button>
          </>
        )}
        {error && <span className="text-red-200">{error}</span>}
        <button type="button" onClick={close} aria-label="Cerrar aviso" className="grid h-6 w-6 place-items-center rounded hover:bg-white/10">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}
