"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { ordersApi, type TenantOrder } from "@/lib/api";
import { getTenant } from "@/lib/auth";
import { providerOrdersHref } from "@/lib/providerOrders";
import ProviderBadge from "@/components/ProviderBadge";
import { buildSellerMessageFromOrder } from "@/lib/seller-message";
import { formatUSD } from "@/lib/format";
import { CheckCircle2, Clock, Copy, Loader2, Pencil, StickyNote, Trash2, X, XCircle } from "lucide-react";

/**
 * Pedidos de la organización. Un vendedor arma el pedido y lo deja firmado acá;
 * el dueño o un administrador lo aprueba y recién entonces sale al proveedor.
 * Los offline se guardan ya aprobados y se pueden editar en Nodo.
 */
export default function PedidosPage() {
  const [orders, setOrders] = useState<TenantOrder[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const tenant = getTenant();

  const load = useCallback(async () => {
    const [todos, pendientes] = await Promise.all([ordersApi.list(), ordersApi.pending()]);
    setOrders(todos.data);
    setCanApprove(pendientes.data.canApprove);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decidir(order: TenantOrder, accion: "aprobar" | "rechazar") {
    if (accion === "rechazar" && !confirm(`¿Rechazar el pedido de ${order.providerName}?`)) return;
    setWorking(order.id);
    setAviso(null);
    try {
      if (accion === "aprobar") {
        const res = await ordersApi.approve(order.id);
        setAviso({ ok: true, text: res.data.message || `Pedido enviado a ${order.providerName}` });
      } else {
        await ordersApi.reject(order.id);
        setAviso({ ok: true, text: `Pedido de ${order.providerName} rechazado` });
      }
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setAviso({ ok: false, text: msg || "No se pudo completar la acción" });
    } finally {
      setWorking(null);
    }
  }

  const esperando = orders.filter((o) => o.approvalStatus === "PENDING_APPROVAL");
  const resto = orders.filter((o) => o.approvalStatus !== "PENDING_APPROVAL");

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Pedidos</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            {tenant ? `Pedidos de ${tenant.name}` : "Pedidos de tu organización"}
            {canApprove ? " — podés aprobar los que arman tus vendedores" : ""}
          </p>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-8">
          {aviso && (
            <div className={`border px-3 py-2.5 text-sm rounded-lg ${
              aviso.ok
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                : "border-red-500/30 bg-red-500/5 text-red-300"
            }`}>
              {aviso.text}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <>
              <section>
                <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-widest mb-3">
                  Esperando aprobación — {esperando.length}
                </h2>
                {esperando.length === 0 ? (
                  <div className="border border-surface-800 rounded-xl p-8 text-center">
                    <p className="text-sm text-surface-300">No hay pedidos esperando una firma.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {esperando.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        canApprove={canApprove}
                        working={working === order.id}
                        onApprove={() => decidir(order, "aprobar")}
                        onReject={() => decidir(order, "rechazar")}
                        onUpdated={load}
                        onAviso={setAviso}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-widest mb-3">
                  Historial — {resto.length}
                </h2>
                {resto.length === 0 ? (
                  <div className="border border-surface-800 rounded-xl p-8 text-center">
                    <p className="text-sm text-surface-300">Todavía no hay pedidos hechos desde Nodo.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {resto.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        canApprove={false}
                        working={false}
                        onUpdated={load}
                        onAviso={setAviso}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function isOffline(order: TenantOrder) {
  return order.channel === "OFFLINE" || order.status === "OFFLINE";
}

function OrderCard({
  order,
  canApprove,
  working,
  onApprove,
  onReject,
  onUpdated,
  onAviso,
}: {
  order: TenantOrder;
  canApprove: boolean;
  working: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onUpdated: () => Promise<void>;
  onAviso: (v: { ok: boolean; text: string } | null) => void;
}) {
  const esperando = order.approvalStatus === "PENDING_APPROVAL";
  const creado = order.status === "CREATED";
  const rechazado = order.approvalStatus === "REJECTED";
  const offline = isOffline(order);
  const lineas = order.items.length;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState(order.notes ?? "");
  const [draft, setDraft] = useState(order.items);

  useEffect(() => {
    if (!editing) {
      setNotes(order.notes ?? "");
      setDraft(order.items);
    }
  }, [order, editing]);

  async function copyMessage() {
    const txt = buildSellerMessageFromOrder({
      provider: order.provider,
      items: editing ? draft : order.items,
      clientName: getTenant()?.name ?? null,
      quoteRate: order.quoteRate ?? null,
    });
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  async function save() {
    const items = draft
      .filter((it) => (it.qty ?? 0) > 0)
      .map((it) => ({
        externalId: it.externalId || it.code || "",
        sku: it.sku,
        name: it.name || "Producto",
        qty: it.qty || 1,
        unitPrice: it.unitPrice ?? 0,
        internosAmount: it.internosAmount ?? 0,
        ivaPercent: it.ivaPercent ?? 0,
        internosPercent: it.internosPercent ?? 0,
      }));
    if (items.length === 0) {
      onAviso({ ok: false, text: "Dejá al menos un producto" });
      return;
    }
    setSaving(true);
    onAviso(null);
    try {
      await ordersApi.updateOffline(order.id, { notes, items });
      setEditing(false);
      await onUpdated();
      onAviso({ ok: true, text: "Pedido actualizado" });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      onAviso({ ok: false, text: msg || "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface-900 border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ProviderBadge
              provider={order.provider}
              label={order.providerName}
              variant="inline"
              size="md"
            />
            {offline && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                Offline
              </span>
            )}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            {lineas} línea{lineas === 1 ? "" : "s"}
            {order.total != null && ` · ${order.total.toLocaleString("es-AR", { style: "currency", currency: "USD" })}`}
            {order.createdBy && ` · lo armó ${order.createdBy}`}
            {` · ${fecha(order.createdAt)}`}
          </p>
        </div>
        <Estado esperando={esperando} creado={creado} rechazado={rechazado} offline={offline} />
      </div>

      {(order.webOrderNumber || order.orderNumber) && (
        <p className="text-[11px] font-mono text-surface-500">
          {order.webOrderNumber ? `Pedido web ${order.webOrderNumber}` : `Orden ${order.orderNumber}`}
        </p>
      )}

      {order.approvedBy && !esperando && (
        <p className="text-[11px] text-surface-500">
          {rechazado ? "Rechazado" : "Aprobado"} por {order.approvedBy}
          {order.rejectionReason ? ` — ${order.rejectionReason}` : ""}
        </p>
      )}

      {order.errorMessage && <p className="text-[12px] text-red-400 leading-snug">{order.errorMessage}</p>}

      {offline && editing && (
        <div className="flex flex-col gap-2 border-t border-surface-800 pt-3">
          {draft.map((it, idx) => (
            <div key={`${it.externalId || it.code || idx}`} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-surface-200 leading-snug">{it.name}</p>
                <div className="flex gap-2 mt-1">
                  <label className="text-[10px] text-surface-500">
                    Cant.
                    <input
                      type="number"
                      min={1}
                      value={it.qty ?? 1}
                      onChange={(e) => {
                        const qty = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setDraft((prev) => prev.map((row, i) => i === idx ? { ...row, qty } : row));
                      }}
                      className="ml-1 w-14 bg-surface-800 border border-surface-700 rounded px-1.5 py-0.5 text-xs text-white"
                    />
                  </label>
                  <label className="text-[10px] text-surface-500">
                    USD
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.unitPrice ?? 0}
                      onChange={(e) => {
                        const unitPrice = Math.max(0, Number(e.target.value) || 0);
                        setDraft((prev) => prev.map((row, i) => i === idx ? { ...row, unitPrice } : row));
                      }}
                      className="ml-1 w-24 bg-surface-800 border border-surface-700 rounded px-1.5 py-0.5 text-xs text-white"
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDraft((prev) => prev.filter((_, i) => i !== idx))}
                className="text-surface-500 hover:text-red-400 p-1"
                aria-label="Quitar"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas (opcional)"
            rows={2}
            className="w-full bg-surface-800 border border-surface-700 rounded-lg px-2.5 py-2 text-xs text-white placeholder-surface-500"
          />
        </div>
      )}

      {offline && !editing && order.items.length > 0 && (
        <ul className="text-[11px] text-surface-400 space-y-0.5 border-t border-surface-800 pt-2">
          {order.items.slice(0, 6).map((it, i) => (
            <li key={`${it.externalId || it.code || i}`}>
              {it.qty ?? 1} · {it.name}
              {it.unitPrice != null ? ` · ${formatUSD(it.unitPrice)}` : ""}
            </li>
          ))}
          {order.items.length > 6 && <li>+{order.items.length - 6} más</li>}
        </ul>
      )}

      <div className="flex items-center gap-2 pt-1 border-t border-surface-800 flex-wrap">
        {esperando && canApprove ? (
          <>
            <button
              type="button"
              onClick={onReject}
              disabled={working}
              className="flex-1 h-9 border border-surface-700 text-surface-300 hover:text-white disabled:opacity-40 rounded-lg text-xs font-medium"
            >
              Rechazar
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={working}
              className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold"
            >
              {working && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {working ? "Enviando al proveedor" : "Aprobar y enviar"}
            </button>
          </>
        ) : esperando ? (
          <p className="text-[11px] text-surface-500 py-1">
            Lo tiene que aprobar el dueño o un administrador de tu organización.
          </p>
        ) : offline ? (
          <>
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="h-9 px-3 border border-surface-700 text-surface-300 rounded-lg text-xs inline-flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="h-9 px-3 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Guardar cambios
                </button>
              </>
            ) : (
              order.editable && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="h-9 px-3 border border-surface-700 text-surface-200 hover:text-white rounded-lg text-xs inline-flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => void copyMessage()}
              className="h-9 px-3 border border-amber-500/30 text-amber-100 rounded-lg text-xs inline-flex items-center gap-1.5"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado" : "Copiar mensaje"}
            </button>
          </>
        ) : (
          <Link
            href={providerOrdersHref(order.provider)}
            className="text-[11px] text-surface-400 hover:text-white underline underline-offset-2 py-1"
          >
            Ver en {order.providerName}
          </Link>
        )}
      </div>
    </div>
  );
}

function Estado({
  esperando, creado, rechazado, offline,
}: {
  esperando: boolean; creado: boolean; rechazado: boolean; offline: boolean;
}) {
  if (esperando) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 flex-shrink-0">
        <Clock className="w-3 h-3" /> Esperando aprobación
      </span>
    );
  }
  if (rechazado) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-surface-500 flex-shrink-0">
        <XCircle className="w-3 h-3" /> Rechazado
      </span>
    );
  }
  if (offline) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 flex-shrink-0">
        <StickyNote className="w-3 h-3" /> Aprobado
      </span>
    );
  }
  if (creado) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 flex-shrink-0">
        <CheckCircle2 className="w-3 h-3" /> Confirmado
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 flex-shrink-0">
      <XCircle className="w-3 h-3" /> No se pudo crear
    </span>
  );
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
