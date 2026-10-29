"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, X } from "lucide-react";
import { ordersApi, type OrderTrackingUpdate } from "@/lib/api";
import { getTenant } from "@/lib/auth";

const EVERY_MS = 60_000;
const SINCE_KEY = "nodo:order-tracking:since";
/** La pantalla de Pedidos escucha esto para recargar. */
export const ORDER_TRACKING_EVENT = "nodo:order-tracking";

function readSince(): string | null {
  try {
    return localStorage.getItem(SINCE_KEY);
  } catch {
    return null;
  }
}

function writeSince(v: string) {
  try {
    localStorage.setItem(SINCE_KEY, v);
  } catch {
    /* sin almacenamiento: se repite como mucho el último aviso */
  }
}

/** Aviso del sistema (solo si el comercio lo permitió y la pestaña no está a la vista). */
function systemNotice(u: OrderTrackingUpdate, onClick: () => void) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const n = new Notification(u.title, { body: u.body, tag: `order-${u.id}-${u.stage}`, icon: "/favicon.ico" });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    /* algunos navegadores solo permiten avisos desde un service worker */
  }
}

/**
 * Mira cada minuto si algún pedido avanzó (lo detecta el backend en el portal del
 * distribuidor) y lo muestra como cartel arriba a la derecha, como en el video:
 * «Air facturó tu pedido». Con la pestaña en segundo plano usa el aviso del navegador.
 */
export default function OrderTrackingWatcher() {
  const router = useRouter();
  const [toasts, setToasts] = useState<OrderTrackingUpdate[]>([]);
  const busy = useRef(false);

  const open = useCallback((id: string) => router.push(`/pedidos?pedido=${encodeURIComponent(id)}`), [router]);

  const poll = useCallback(async () => {
    if (busy.current) return;
    const tenant = getTenant();
    if (!tenant || tenant.type === "DISTRIBUTOR") return;
    busy.current = true;
    try {
      const { data } = await ordersApi.trackingUpdates(readSince());
      writeSince(data.now);
      if (data.updates.length === 0) return;
      setToasts((prev) => [...prev, ...data.updates].slice(-3));
      for (const u of data.updates) systemNotice(u, () => open(u.id));
      window.dispatchEvent(new CustomEvent(ORDER_TRACKING_EVENT));
    } catch {
      /* sin sesión o sin red: se reintenta en el próximo minuto */
    } finally {
      busy.current = false;
    }
  }, [open]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), EVERY_MS);
    return () => clearInterval(t);
  }, [poll]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => setToasts((prev) => prev.slice(1)), 12_000);
    return () => clearTimeout(t);
  }, [toasts]);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-14 lg:top-20 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-96" aria-live="polite">
      {toasts.map((u) => (
        <div
          key={`${u.id}-${u.stage}`}
          className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-surface-900 px-3.5 py-3 shadow-2xl shadow-black/40"
        >
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
            <Package className="h-4 w-4" aria-hidden />
          </span>
          <button
            type="button"
            onClick={() => {
              setToasts((prev) => prev.filter((x) => x !== u));
              open(u.id);
            }}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block text-sm font-semibold text-white">{u.title}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-surface-400">{u.body}</span>
          </button>
          <button
            type="button"
            onClick={() => setToasts((prev) => prev.filter((x) => x !== u))}
            className="p-0.5 text-surface-500 hover:text-white"
            aria-label="Cerrar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
