"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, MessageCircle, Phone, XCircle } from "lucide-react";
import { storefrontApi, type StorefrontOrder, type StorefrontOrderStatus } from "@/lib/api";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, ago, apiError, whatsappLink } from "@/lib/storefront";

const FILTERS: { key: StorefrontOrderStatus | "ALL"; label: string }[] = [
  { key: "PENDING", label: "Por confirmar" },
  { key: "CONFIRMED", label: "Confirmados" },
  { key: "REJECTED", label: "Rechazados" },
  { key: "CANCELLED", label: "Cancelados" },
  { key: "ALL", label: "Todos" },
];

function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Pedidos que otros comercios le hicieron a la tienda. */
export default function StorefrontOrders({ storeName, onChanged }: { storeName: string; onChanged: () => void }) {
  const [filter, setFilter] = useState<StorefrontOrderStatus | "ALL">("PENDING");
  const [orders, setOrders] = useState<StorefrontOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await storefrontApi.orders(filter === "ALL" ? undefined : filter);
      setOrders(res.data);
    } catch (err) {
      setAviso({ ok: false, text: apiError(err, "No se pudieron cargar los pedidos") });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === f.key ? "border-brand-500 bg-brand-500/10 text-white" : "border-surface-700 text-surface-300 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {aviso && (
        <p className={`rounded-md px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{aviso.text}</p>
      )}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-surface-800 bg-surface-900 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-white">
            {filter === "PENDING" ? "No tenés pedidos por confirmar" : "No hay pedidos acá"}
          </p>
          <p className="mt-1 text-xs text-surface-400">Cuando otro comercio te haga un pedido, te avisamos y aparece acá.</p>
        </div>
      ) : (
        orders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            storeName={storeName}
            onDone={async (text) => {
              setAviso({ ok: true, text });
              await load();
              onChanged();
            }}
            onError={(text) => setAviso({ ok: false, text })}
          />
        ))
      )}
    </div>
  );
}

function OrderCard({
  order,
  storeName,
  onDone,
  onError,
}: {
  order: StorefrontOrder;
  storeName: string;
  onDone: (text: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const [working, setWorking] = useState<"CONFIRM" | "REJECT" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const short = order.items.filter((i) => i.stockNow != null && i.qty > i.stockNow);
  const wa = whatsappLink(order.buyer.phone, `Hola ${order.buyer.name}, te escribo de ${storeName} por tu pedido en NODO.`);

  async function respond(action: "CONFIRM" | "REJECT") {
    if (action === "REJECT" && !note.trim()) return onError("Contale al comprador por qué lo rechazás");
    setWorking(action);
    try {
      await storefrontApi.respond(order.id, action, note.trim() || undefined);
      await onDone(action === "CONFIRM" ? `Confirmaste el pedido de ${order.buyer.name}. Ya le avisamos.` : `Rechazaste el pedido de ${order.buyer.name}.`);
    } catch (err) {
      onError(apiError(err, "No se pudo responder el pedido"));
    } finally {
      setWorking(null);
    }
  }

  return (
    <article
      className={`rounded-2xl border bg-surface-900 p-4 sm:p-5 ${
        order.status === "PENDING" ? "border-sky-500/30 shadow-[inset_3px_0_0_0_rgb(56_189_248)]" : "border-surface-800"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{order.buyer.name}</p>
          <p className="text-[11px] text-surface-500">
            {order.buyer.person ? `${order.buyer.person} · ` : ""}
            {ago(order.createdAt)}
          </p>
        </div>
        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ORDER_STATUS_TONE[order.status]}`}>
          {ORDER_STATUS_LABEL[order.status]}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-surface-800 rounded-xl border border-surface-800">
        {order.items.map((i) => (
          <li key={i.externalId} className="flex items-center gap-3 px-3 py-2 text-xs">
            <span className="w-10 flex-shrink-0 text-right font-semibold tabular-nums text-white">{i.qty}×</span>
            <span className="min-w-0 flex-1 truncate text-surface-200" title={i.name}>
              {i.name}
              {i.sku && <span className="ml-1.5 text-surface-500">{i.sku}</span>}
            </span>
            {i.unitPrice != null && <span className="tabular-nums text-surface-400">{usd(i.unitPrice)} neto c/u</span>}
            {order.status === "PENDING" && i.stockNow != null && (
              <span className={`tabular-nums ${i.qty > i.stockNow ? "text-amber-300" : "text-surface-500"}`}>stock {i.stockNow}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-surface-400">
          Total con IVA que vio el comprador (en dólares{order.quoteRate ? `, dólar $${order.quoteRate.toLocaleString("es-AR")}` : ""})
        </span>
        <span className="font-semibold tabular-nums text-white">{usd(order.total)}</span>
      </div>
      {order.notes && <p className="mt-2 rounded-lg bg-surface-950/50 px-3 py-2 text-xs text-surface-300">Nota: {order.notes}</p>}
      {order.status === "PENDING" && short.length > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          Pidió más de lo que tenés publicado en {short.length === 1 ? "un producto" : `${short.length} productos`}. Si
          confirmás, el stock queda en 0.
        </p>
      )}
      {order.note && order.status !== "PENDING" && (
        <p className="mt-2 text-xs text-surface-400">
          {order.status === "REJECTED" ? "Motivo" : "Nota"}: {order.note}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/10"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        )}
        {order.buyer.phone && !wa && (
          <span className="inline-flex items-center gap-1.5 text-xs text-surface-300">
            <Phone className="h-3.5 w-3.5" /> {order.buyer.phone}
          </span>
        )}
        {order.buyer.email && (
          <a href={`mailto:${order.buyer.email}`} className="inline-flex items-center gap-1.5 text-xs text-surface-300 hover:text-white">
            <Mail className="h-3.5 w-3.5" /> {order.buyer.email}
          </a>
        )}
      </div>

      {order.status === "PENDING" && (
        <div className="mt-4 flex flex-col gap-2 border-t border-surface-800 pt-4">
          {rejecting ? (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Por qué lo rechazás (lo ve el comprador)"
                className="w-full rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-xs text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void respond("REJECT")}
                  disabled={working !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600/80 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {working === "REJECT" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                  Rechazar pedido
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="rounded-lg border border-surface-700 px-3 py-2 text-xs text-surface-300 hover:text-white"
                >
                  Volver
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void respond("CONFIRM")}
                disabled={working !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {working === "CONFIRM" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Confirmar pedido
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="rounded-lg border border-surface-700 px-3 py-2 text-xs text-surface-200 hover:text-white"
              >
                Rechazar
              </button>
              <span className="self-center text-[11px] text-surface-500">Confirmar descuenta el stock publicado.</span>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
