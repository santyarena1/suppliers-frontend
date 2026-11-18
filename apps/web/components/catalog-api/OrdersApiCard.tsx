"use client";

import { useState } from "react";
import { Check, Loader2, Plus, ShoppingCart } from "lucide-react";
import { catalogApiAdmin } from "@/lib/api";
import { ORDERS_SCOPE, ORDER_WEBHOOK_EVENTS, ORDER_WEBHOOK_EVENT_LABELS, type ApiClientView } from "@/lib/catalog-api";
import { CopyButton, StatusPill, apiMessage, ghostBtn, primaryBtn } from "./ui";

/**
 * API de pedidos (hoy solo The Gamer Shop → AcuStock): qué keys la tienen,
 * habilitarla con un clic y cómo tomarla. Se muestra solo con `ordersAvailable`.
 */
export default function OrdersApiCard({
  clients,
  baseUrl,
  canManage,
  onChange,
  onCreate,
  onMessage,
}: {
  clients: ApiClientView[];
  baseUrl: string;
  canManage: boolean;
  onChange: (next: ApiClientView) => void;
  onCreate: () => void;
  onMessage: (ok: boolean, text: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const withOrders = clients.filter((c) => c.scopes.includes(ORDERS_SCOPE));
  const base = baseUrl.replace(/\/$/, "");
  const key = withOrders[0]?.publicKey ?? "nodo_pk_…";
  const curl = `curl "${base}/v1/pedidos?desde=2026-11-01&limit=100" \\
  -H "X-Api-Key: ${key}" \\
  -H "X-Api-Secret: $NODO_API_SECRET"`;

  async function toggle(c: ApiClientView, on: boolean) {
    setBusy(c.id);
    try {
      const scopes = on ? [...new Set([...c.scopes, ORDERS_SCOPE])] : c.scopes.filter((s) => s !== ORDERS_SCOPE);
      const res = await catalogApiAdmin.updateClient(c.id, { scopes });
      onChange(res.data.client);
      onMessage(true, on ? `La key «${c.name}» ya puede leer pedidos. Sumá el webhook en su pestaña Webhooks.` : `La key «${c.name}» dejó de leer pedidos.`);
    } catch (err) {
      onMessage(false, apiMessage(err, "No se pudo cambiar el permiso"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-brand-500/30 bg-brand-500/[0.04] p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-brand-300" />
            <h2 className="text-sm font-semibold text-white">API de pedidos</h2>
            <StatusPill tone="brand">Solo para tu organización</StatusPill>
          </div>
          <p className="mt-1 text-xs text-surface-400 max-w-2xl">
            Tu sistema (AcuStock) recibe cada compra que hacés en NODO: renglones, IVA, internos, percepciones, envío, seguimiento y factura.
            Usa la misma key y el mismo secret que el catálogo.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-surface-200">1. Elegí la key que usa AcuStock</p>
        {clients.length === 0 ? (
          <div className="rounded-lg border border-dashed border-surface-700 px-3 py-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-surface-400">Todavía no tenés ninguna key activa.</p>
            {canManage && (
              <button type="button" onClick={onCreate} className={primaryBtn}>
                <Plus className="w-3.5 h-3.5" /> Crear key
              </button>
            )}
          </div>
        ) : (
          clients.map((c) => {
            const on = c.scopes.includes(ORDERS_SCOPE);
            return (
              <div key={c.id} className="rounded-lg border border-surface-800 bg-surface-950 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-white">{c.name}</span>
                  <code className="text-[11px] text-surface-500 font-mono">{c.publicKey}</code>
                  {on ? <StatusPill tone="ok">Lee pedidos</StatusPill> : <StatusPill tone="muted">Sin pedidos</StatusPill>}
                </div>
                {canManage &&
                  (on ? (
                    <button type="button" disabled={busy === c.id} onClick={() => void toggle(c, false)} className={ghostBtn}>
                      {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Quitar pedidos
                    </button>
                  ) : (
                    <button type="button" disabled={busy === c.id} onClick={() => void toggle(c, true)} className={primaryBtn}>
                      {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Habilitar pedidos
                    </button>
                  ))}
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-surface-200">2. Recibí los avisos</p>
        <p className="text-xs text-surface-400">
          Abrí la key (más abajo) → pestaña <span className="text-surface-200">Webhooks</span> → agregá la URL de AcuStock. Los avisos de pedidos ya vienen tildados:
        </p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {ORDER_WEBHOOK_EVENTS.map((ev) => (
            <li key={ev} className="rounded-md border border-surface-800 bg-surface-950 px-2.5 py-2">
              <span className="block text-xs text-surface-100">{ORDER_WEBHOOK_EVENT_LABELS[ev]}</span>
              <code className="text-[10px] text-surface-500">{ev}</code>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-surface-500">Cada aviso trae el pedido completo y su `version`: guardalo solo si es más nueva que la que tenés.</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-surface-200">3. O consultalos cuando quieras</p>
        <div className="overflow-hidden rounded-lg border border-surface-800 bg-surface-950">
          <div className="flex items-center justify-between border-b border-surface-800 px-3 py-1.5">
            <span className="text-[11px] text-surface-500">
              <code className="text-surface-300">GET /v1/pedidos?desde=</code> · <code className="text-surface-300">GET /v1/pedidos/NODO-123</code>
            </span>
            <CopyButton text={curl} />
          </div>
          <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed text-surface-200 font-mono">{curl}</pre>
        </div>
      </div>

      <p className="text-[11px] text-surface-500 border-t border-surface-800 pt-3">
        Todas las facturas de Elit, Solution Box, New Bytes y Air llegan con CAE y PDF guardado en NODO, aunque no sean de un pedido hecho por NODO (<code>GET /v1/facturas</code>; las sueltas traen <code>pedido: null</code>). New Bytes no publica el PDF original: NODO lo arma con sus datos oficiales y el QR. Cada factura trae sus renglones reales (precio e IVA facturados) y, si el pedido se armó en esquema, el kit con su IVA: para el costo real usá esos, no los del carrito. Invid y New Tree por ahora solo dan el número de factura. Lo que el distribuidor no informa va vacío: nunca se estima.
      </p>
    </section>
  );
}
