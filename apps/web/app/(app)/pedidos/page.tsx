"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import DistributorOrders from "@/components/org/DistributorOrders";
import { chatApi, ordersApi, type TenantOrder } from "@/lib/api";
import { getTenant } from "@/lib/auth";
import { providerOrdersHref } from "@/lib/providerOrders";
import ProviderBadge from "@/components/ProviderBadge";
import { buildSellerMessageFromOrder } from "@/lib/seller-message";
import { formatUSD } from "@/lib/format";
import { usePurchasePolicy } from "@/lib/purchase";
import {
  applySchemeToLine,
  lineAmounts,
  markLineEdited,
  sumOrderLines,
} from "@/lib/order-lines";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  ExternalLink,
  Inbox,
  Layers,
  Loader2,
  MessageSquare,
  Pencil,
  StickyNote,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

type FilterKey = "all" | "pending" | "offline" | "done" | "rejected";

/**
 * Pedidos de la organización. Un vendedor arma el pedido y lo deja firmado acá;
 * el dueño o un administrador lo aprueba y recién entonces sale al proveedor.
 * Los offline se guardan ya aprobados y se pueden editar en Nodo.
 *
 * El distribuidor ve los pedidos de sus comercios, no el tablero de compras.
 */
export default function PedidosPage() {
  const tenant = getTenant();
  if (tenant?.type === "DISTRIBUTOR") return <DistributorOrders />;
  return <RetailerPedidosPage />;
}

function RetailerPedidosPage() {
  const [orders, setOrders] = useState<TenantOrder[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const tenant = getTenant();

  const load = useCallback(async () => {
    const [todos, pendientes] = await Promise.all([ordersApi.list(), ordersApi.pending()]);
    setOrders(todos.data);
    setCanApprove(pendientes.data.canApprove);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

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

  const esperando = useMemo(
    () => orders.filter((o) => o.approvalStatus === "PENDING_APPROVAL"),
    [orders],
  );
  const offline = useMemo(() => orders.filter(isOffline), [orders]);
  const rechazados = useMemo(
    () => orders.filter((o) => o.approvalStatus === "REJECTED"),
    [orders],
  );
  const confirmados = useMemo(
    () => orders.filter((o) =>
      o.approvalStatus !== "PENDING_APPROVAL"
      && o.approvalStatus !== "REJECTED"
      && (o.status === "CREATED" || isOffline(o)),
    ),
    [orders],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "pending": return esperando;
      case "offline": return offline;
      case "rejected": return rechazados;
      case "done": return confirmados;
      default: return orders;
    }
  }, [filter, orders, esperando, offline, rechazados, confirmados]);

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "Todos", count: orders.length },
    { key: "pending", label: "Esperando", count: esperando.length },
    { key: "offline", label: "Offline", count: offline.length },
    { key: "done", label: "Confirmados", count: confirmados.length },
    { key: "rejected", label: "Rechazados", count: rechazados.length },
  ];

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-white">Pedidos</h1>
          <p className="text-xs text-surface-500 hidden sm:block truncate">
            {tenant ? tenant.name : "Tu organización"}
            {canApprove ? " · podés aprobar lo que arman tus vendedores" : " · seguimiento de pedidos al proveedor"}
          </p>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
          {aviso && (
            <div
              role="status"
              className={`flex items-start gap-3 border px-3.5 py-3 text-sm rounded-xl ${
                aviso.ok
                  ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-200"
                  : "border-red-500/25 bg-red-500/8 text-red-200"
              }`}
            >
              {aviso.ok
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              <p className="flex-1 leading-snug">{aviso.text}</p>
              <button
                type="button"
                onClick={() => setAviso(null)}
                className="text-current/60 hover:text-current p-0.5"
                aria-label="Cerrar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              <p className="text-xs text-surface-500">Cargando pedidos…</p>
            </div>
          ) : (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <StatTile
                  label="Esperando firma"
                  value={esperando.length}
                  accent={esperando.length > 0 ? "amber" : "muted"}
                  onClick={() => setFilter("pending")}
                  active={filter === "pending"}
                />
                <StatTile
                  label="Offline"
                  value={offline.length}
                  accent="muted"
                  onClick={() => setFilter("offline")}
                  active={filter === "offline"}
                />
                <StatTile
                  label="Confirmados"
                  value={confirmados.length}
                  accent="emerald"
                  onClick={() => setFilter("done")}
                  active={filter === "done"}
                />
                <StatTile
                  label="Total"
                  value={orders.length}
                  accent="brand"
                  onClick={() => setFilter("all")}
                  active={filter === "all"}
                />
              </div>

              {canApprove && esperando.length > 0 && filter !== "pending" && (
                <button
                  type="button"
                  onClick={() => setFilter("pending")}
                  className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left hover:bg-amber-500/15 transition-colors"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
                    <Clock className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-amber-100">
                      {esperando.length} pedido{esperando.length === 1 ? "" : "s"} esperando tu firma
                    </span>
                    <span className="block text-[11px] text-amber-200/70 mt-0.5">
                      Tocá para revisarlos y aprobar o rechazar
                    </span>
                  </span>
                  <ChevronDown className="w-4 h-4 text-amber-300/80 -rotate-90" />
                </button>
              )}

              {/* Filtros */}
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      filter === f.key
                        ? "bg-brand-600/20 text-brand-300 ring-1 ring-brand-500/40"
                        : "bg-surface-900 text-surface-400 ring-1 ring-surface-800 hover:text-surface-200"
                    }`}
                  >
                    {f.label}
                    <span className={`tabular-nums text-[10px] ${filter === f.key ? "text-brand-400/80" : "text-surface-600"}`}>
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Lista */}
              {filtered.length === 0 ? (
                <EmptyState filter={filter} hasAny={orders.length > 0} />
              ) : (
                <div className="flex flex-col gap-3">
                  {(filter === "all"
                    ? [...esperando, ...orders.filter((o) => o.approvalStatus !== "PENDING_APPROVAL")]
                    : filtered
                  ).map((order, i, arr) => {
                    const prev = i > 0 ? arr[i - 1] : null;
                    const showHistDivider =
                      filter === "all"
                      && prev?.approvalStatus === "PENDING_APPROVAL"
                      && order.approvalStatus !== "PENDING_APPROVAL";
                    return (
                      <div key={order.id} className="flex flex-col gap-3">
                        {i === 0 && filter === "all" && esperando.length > 0 && (
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/80 px-0.5">
                            Por aprobar
                          </p>
                        )}
                        {showHistDivider && (
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-600 px-0.5 pt-2">
                            Historial
                          </p>
                        )}
                        <OrderCard
                          order={order}
                          canApprove={canApprove}
                          working={working === order.id}
                          onApprove={() => decidir(order, "aprobar")}
                          onReject={() => decidir(order, "rechazar")}
                          onUpdated={load}
                          onAviso={setAviso}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function StatTile({
  label, value, accent, onClick, active,
}: {
  label: string;
  value: number;
  accent: "amber" | "emerald" | "brand" | "muted";
  onClick: () => void;
  active: boolean;
}) {
  const accents = {
    amber: "text-amber-300",
    emerald: "text-emerald-400",
    brand: "text-brand-400",
    muted: "text-surface-200",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3.5 py-3 text-left transition-all ${
        active
          ? "border-brand-500/40 bg-brand-600/10"
          : "border-surface-800 bg-surface-900/80 hover:border-surface-700"
      }`}
    >
      <p className={`text-xl font-bold tabular-nums leading-none ${accents[accent]}`}>{value}</p>
      <p className="text-[10px] text-surface-500 mt-1.5 font-medium">{label}</p>
    </button>
  );
}

function EmptyState({ filter, hasAny }: { filter: FilterKey; hasAny: boolean }) {
  const copy: Record<FilterKey, { title: string; sub: string }> = {
    all: {
      title: "Todavía no hay pedidos",
      sub: "Cuando armes uno desde el carrito, aparece acá para firmarlo o seguirlo.",
    },
    pending: {
      title: "Nada esperando firma",
      sub: hasAny ? "No hay pedidos pendientes de aprobación." : "Cuando un vendedor deje un pedido firmado, lo ves acá.",
    },
    offline: {
      title: "Sin pedidos offline",
      sub: "Los pedidos armados para WhatsApp / vendedor aparecen en este filtro.",
    },
    done: {
      title: "Sin confirmados aún",
      sub: "Acá van los pedidos enviados al proveedor o ya aprobados offline.",
    },
    rejected: {
      title: "Sin rechazados",
      sub: "Los pedidos que se rechacen en la firma quedan listados acá.",
    },
  };
  const c = copy[filter];
  return (
    <div className="rounded-2xl border border-dashed border-surface-700 bg-surface-900/40 px-6 py-14 text-center">
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-800 text-surface-500">
        {filter === "all" ? <ClipboardList className="w-5 h-5" /> : <Inbox className="w-5 h-5" />}
      </span>
      <p className="text-sm font-medium text-surface-200">{c.title}</p>
      <p className="text-xs text-surface-500 mt-1.5 max-w-sm mx-auto leading-relaxed">{c.sub}</p>
      {!hasAny && (
        <Link
          href="/cart"
          className="inline-flex mt-5 text-xs font-semibold text-brand-400 hover:text-brand-300"
        >
          Ir al carrito
        </Link>
      )}
    </div>
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
  const canEditItems = Boolean(order.editable);
  const policy = usePurchasePolicy(order.provider);
  const canScheme = Boolean(policy.acceptsScheme && policy.schemeIvaAdjustment);
  const lineas = order.items.length;
  const needsCollapse = lineas > 5;
  const [editing, setEditing] = useState(false);
  const [showAllItems, setShowAllItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);
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

  async function shareInChat() {
    setSharing(true);
    try {
      await chatApi.shareOrder(order.id);
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    } catch { /* el interceptor muestra el error si hay 401; acá no bloqueamos el pedido */ }
    finally {
      setSharing(false);
    }
  }

  async function save() {
    const items = draft
      .filter((it) => (it.qty ?? 0) > 0)
      .map((it) => {
        const row = lineAmounts(it);
        return {
          externalId: it.externalId || it.code || "",
          sku: it.sku,
          name: it.name || "Producto",
          qty: it.qty || 1,
          unitPrice: row.unitNet,
          internosAmount: it.internosAmount ?? (row.qty > 0 ? row.internos / row.qty : 0),
          ivaPercent: row.ivaPercent,
          internosPercent: row.internosPercent,
          finalLineUsd: row.final,
          pricingMode: it.pricingMode ?? undefined,
          listUnitPrice: it.listUnitPrice ?? row.listUnitPrice ?? undefined,
          edited: it.edited || undefined,
          editedAt: it.editedAt ?? undefined,
          originalUnitPrice: it.originalUnitPrice ?? undefined,
          originalFinalLineUsd: it.originalFinalLineUsd ?? undefined,
          editNote: it.editNote ?? undefined,
        };
      });
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

  const visibleItems = !needsCollapse || showAllItems
    ? order.items
    : order.items.slice(0, 5);

  const totals = useMemo(() => sumOrderLines(order.items), [order.items]);

  return (
    <article
      className={`rounded-2xl border bg-surface-900 overflow-hidden transition-colors ${
        esperando
          ? "border-amber-500/35 shadow-[inset_3px_0_0_0_rgb(245_158_11)]"
          : rechazado
            ? "border-surface-800 opacity-80"
            : "border-surface-800"
      }`}
    >
      <div className="p-4 sm:p-5 flex flex-col gap-4">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <ProviderBadge
                provider={order.provider}
                label={order.providerName}
                variant="inline"
                size="md"
              />
              {offline && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-200 bg-amber-500/15 border border-amber-500/25 rounded-md px-1.5 py-0.5">
                  Offline
                </span>
              )}
              {(order.webOrderNumber || order.orderNumber) && (
                <span className="text-[11px] font-mono text-surface-400">
                  {order.webOrderNumber ? `Web #${order.webOrderNumber}` : `#${order.orderNumber}`}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[11px] text-surface-500">
              <span>{lineas} línea{lineas === 1 ? "" : "s"}</span>
              {totals.final > 0 && (
                <>
                  <span className="text-surface-700">·</span>
                  <span className="tabular-nums text-surface-200 font-semibold">
                    {formatUSD(totals.final)}
                  </span>
                </>
              )}
              {order.createdBy && (
                <>
                  <span className="text-surface-700">·</span>
                  <span>por {order.createdBy}</span>
                </>
              )}
              <span className="text-surface-700">·</span>
              <span title={new Date(order.createdAt).toLocaleString("es-AR")}>{fecha(order.createdAt)}</span>
            </div>
          </div>
          <Estado esperando={esperando} creado={creado} rechazado={rechazado} offline={offline} />
        </div>

        {/* Meta del pedido (como en carrito / checkout) */}
        {(order.paymentLabel || order.deliveryLabel || order.notes || order.quoteRate) && !editing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {order.paymentLabel && (
              <MetaChip label="Pago" value={order.paymentLabel} />
            )}
            {order.deliveryLabel && (
              <MetaChip label="Entrega" value={order.deliveryLabel} />
            )}
            {order.quoteRate != null && order.quoteRate > 0 && (
              <MetaChip label="Cotización" value={`$${order.quoteRate.toLocaleString("es-AR")}`} />
            )}
            {order.notes && (
              <MetaChip label="Notas" value={order.notes} className="sm:col-span-2 lg:col-span-1" />
            )}
          </div>
        )}

        {order.approvedBy && !esperando && (
          <p className="text-[11px] text-surface-500">
            {rechazado ? "Rechazado" : "Aprobado"} por <span className="text-surface-300">{order.approvedBy}</span>
            {order.rejectionReason ? ` — ${order.rejectionReason}` : ""}
          </p>
        )}

        {order.errorMessage && (
          <p className="text-xs text-red-300 leading-snug rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
            {order.errorMessage}
          </p>
        )}

        {/* Ítems */}
        {canEditItems && editing ? (
          <div className="flex flex-col gap-2.5 border border-surface-800 rounded-xl p-3 bg-surface-950/40">
            <p className="text-[11px] text-surface-400 leading-relaxed">
              Ajustá neto o final si el distribuidor cambió un número. Podés marcar líneas como{" "}
              <span className="text-violet-300">esquema</span> para aplicar la config del proveedor
              y seguir editando el precio final.
            </p>
            {draft.map((it, idx) => {
              const row = lineAmounts(it);
              const code = it.externalId || it.code || it.sku || "—";
              return (
                <div
                  key={`${code}-${idx}`}
                  className="rounded-lg bg-surface-900/80 border border-surface-800 p-3 flex flex-col gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-white font-medium leading-snug">{it.name}</p>
                      <p className="text-[10px] font-mono text-surface-500 mt-0.5">{code}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {it.pricingMode === "scheme" && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/25">
                            Esquema
                          </span>
                        )}
                        {it.edited && (
                          <span
                            className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/25"
                            title={it.editNote || "Valor editado"}
                          >
                            Editado
                          </span>
                        )}
                      </div>
                    </div>
                    {offline && (
                      <button
                        type="button"
                        onClick={() => setDraft((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-surface-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10"
                        aria-label="Quitar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="text-[10px] text-surface-500 flex flex-col gap-1">
                      Cant.
                      <input
                        type="number"
                        min={1}
                        value={it.qty ?? 1}
                        onChange={(e) => {
                          const qty = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setDraft((prev) =>
                            prev.map((rowIt, i) =>
                              i === idx ? markLineEdited(rowIt, { qty }, "Cantidad ajustada") : rowIt
                            )
                          );
                        }}
                        className="w-full bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white tabular-nums"
                      />
                    </label>
                    <label className="text-[10px] text-surface-500 flex flex-col gap-1">
                      Neto USD (c/u)
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={Number(row.unitNet.toFixed(2))}
                        onChange={(e) => {
                          const unitPrice = Math.max(0, Number(e.target.value) || 0);
                          setDraft((prev) =>
                            prev.map((rowIt, i) =>
                              i === idx
                                ? markLineEdited(
                                    rowIt,
                                    {
                                      unitPrice,
                                      price: unitPrice,
                                      lineTotal: unitPrice * (rowIt.qty || 1),
                                      subtotal: unitPrice * (rowIt.qty || 1),
                                      finalLineUsd: undefined,
                                    },
                                    "Neto ajustado manualmente"
                                  )
                                : rowIt
                            )
                          );
                        }}
                        className="w-full bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white tabular-nums"
                      />
                    </label>
                    <label className="text-[10px] text-surface-500 flex flex-col gap-1">
                      IVA %
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={row.ivaPercent}
                        onChange={(e) => {
                          const ivaPercent = Math.max(0, Number(e.target.value) || 0);
                          setDraft((prev) =>
                            prev.map((rowIt, i) =>
                              i === idx
                                ? markLineEdited(rowIt, { ivaPercent, finalLineUsd: undefined }, "IVA ajustado")
                                : rowIt
                            )
                          );
                        }}
                        className="w-full bg-surface-800 border border-surface-700 rounded-md px-2 py-1.5 text-xs text-white tabular-nums"
                      />
                    </label>
                    <label className="text-[10px] text-surface-500 flex flex-col gap-1">
                      Final línea USD
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={Number(row.final.toFixed(2))}
                        onChange={(e) => {
                          const finalLineUsd = Math.max(0, Number(e.target.value) || 0);
                          setDraft((prev) =>
                            prev.map((rowIt, i) =>
                              i === idx
                                ? markLineEdited(rowIt, { finalLineUsd }, "Final ajustado (p. ej. baja del distribuidor)")
                                : rowIt
                            )
                          );
                        }}
                        className="w-full bg-surface-800 border border-amber-500/30 rounded-md px-2 py-1.5 text-xs text-white tabular-nums"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {canScheme && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) =>
                            prev.map((rowIt, i) => (i === idx ? applySchemeToLine(rowIt, policy) : rowIt))
                          )
                        }
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border border-violet-500/35 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15"
                      >
                        <Layers className="w-3 h-3" />
                        {it.pricingMode === "scheme" ? "Reaplicar esquema" : "Aplicar esquema"}
                      </button>
                    )}
                    {it.edited && it.originalFinalLineUsd != null && (
                      <span className="text-[10px] text-amber-200/80 tabular-nums">
                        Original {formatUSD(it.originalFinalLineUsd)}
                        {it.editNote ? ` · ${it.editNote}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas del pedido (opcional)"
              rows={2}
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-xs text-white placeholder-surface-500 resize-none"
            />
          </div>
        ) : order.items.length > 0 ? (
          <div className="border border-surface-800 rounded-xl overflow-hidden bg-surface-950/40">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[720px]">
                <thead>
                  <tr className="border-b border-surface-800 text-[10px] uppercase tracking-wider text-surface-500">
                    <th className="px-3 py-2 font-semibold">Código</th>
                    <th className="px-3 py-2 font-semibold">Producto</th>
                    <th className="px-3 py-2 font-semibold text-right">Cant.</th>
                    <th className="px-3 py-2 font-semibold text-right">Neto</th>
                    <th className="px-3 py-2 font-semibold text-right">IVA</th>
                    <th className="px-3 py-2 font-semibold text-right">Internos</th>
                    <th className="px-3 py-2 font-semibold text-right">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((it, i) => {
                    const row = lineAmounts(it);
                    const code = it.externalId || it.code || it.sku || "—";
                    return (
                      <tr
                        key={`${code}-${i}`}
                        className="border-b border-surface-800/70 last:border-0 hover:bg-surface-900/50"
                      >
                        <td className="px-3 py-2.5 font-mono text-[11px] text-surface-500 whitespace-nowrap">
                          {code}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-surface-200 leading-snug max-w-[280px]">
                          <span className="line-clamp-2">{it.name || "Producto"}</span>
                          <span className="flex flex-wrap gap-1 mt-1">
                            {row.pricingMode === "scheme" && (
                              <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/25">
                                Esquema
                              </span>
                            )}
                            {row.edited && (
                              <span
                                className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/25"
                                title={
                                  [
                                    row.editNote,
                                    row.originalFinal != null ? `Antes ${formatUSD(row.originalFinal)}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Editado"
                                }
                              >
                                Editado
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-surface-300 tabular-nums text-right">
                          {row.qty}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <p className="text-xs text-surface-200 tabular-nums">{formatUSD(row.net)}</p>
                          {row.qty > 1 && (
                            <p className="text-[10px] text-surface-600 tabular-nums">{formatUSD(row.unitNet)} c/u</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <TaxPair percent={row.ivaPercent} amount={row.iva} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <TaxPair percent={row.internosPercent} amount={row.internos} />
                        </td>
                        <td className="px-3 py-2.5 text-xs font-semibold text-white tabular-nums text-right">
                          {formatUSD(row.final)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-900/80 border-t border-surface-700">
                    <td colSpan={3} className="px-3 py-2.5 text-[11px] text-surface-500 font-medium">
                      Totales · {lineas} línea{lineas === 1 ? "" : "s"}
                      {needsCollapse && !showAllItems ? ` (mostrando 5)` : ""}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-surface-300 tabular-nums text-right">
                      {formatUSD(totals.net)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-surface-300 tabular-nums text-right">
                      {totals.iva > 0.0005 ? formatUSD(totals.iva) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-surface-300 tabular-nums text-right">
                      {totals.internos > 0.0005 ? formatUSD(totals.internos) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-sm font-bold text-white tabular-nums text-right">
                      {formatUSD(totals.final)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile stacked rows */}
            <ul className="md:hidden divide-y divide-surface-800">
              {visibleItems.map((it, i) => {
                const row = lineAmounts(it);
                const code = it.externalId || it.code || it.sku || "—";
                return (
                  <li key={`${code}-m-${i}`} className="px-3 py-3 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white leading-snug">{it.name || "Producto"}</p>
                        <p className="text-[10px] font-mono text-surface-500 mt-0.5">
                          {code} · {row.qty}×
                        </p>
                        <span className="flex flex-wrap gap-1 mt-1">
                          {row.pricingMode === "scheme" && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/25">
                              Esquema
                            </span>
                          )}
                          {row.edited && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/25">
                              Editado
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white tabular-nums flex-shrink-0">
                        {formatUSD(row.final)}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <p className="text-surface-500 uppercase tracking-wider mb-0.5">Neto</p>
                        <p className="text-surface-200 tabular-nums">{formatUSD(row.net)}</p>
                      </div>
                      <div>
                        <p className="text-surface-500 uppercase tracking-wider mb-0.5">IVA</p>
                        <TaxPair percent={row.ivaPercent} amount={row.iva} />
                      </div>
                      <div>
                        <p className="text-surface-500 uppercase tracking-wider mb-0.5">Internos</p>
                        <TaxPair percent={row.internosPercent} amount={row.internos} />
                      </div>
                    </div>
                  </li>
                );
              })}
              <li className="px-3 py-2.5 flex items-center justify-between bg-surface-900/80 text-xs">
                <span className="text-surface-500">Total pedido</span>
                <span className="font-bold text-white tabular-nums">{formatUSD(totals.final)}</span>
              </li>
            </ul>

            {needsCollapse && (
              <button
                type="button"
                onClick={() => setShowAllItems((v) => !v)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium text-surface-400 hover:text-white border-t border-surface-800 bg-surface-900/40"
              >
                {showAllItems ? (
                  <>Mostrar menos <ChevronDown className="w-3.5 h-3.5 rotate-180" /></>
                ) : (
                  <>Ver los {lineas - 5} restantes <ChevronDown className="w-3.5 h-3.5" /></>
                )}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-surface-500 border-t border-surface-800 pt-3">
            Este pedido no tiene ítems cargados.
          </p>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-2 flex-wrap">
          {esperando && canApprove ? (
            <>
              <button
                type="button"
                onClick={onReject}
                disabled={working}
                className="flex-1 h-10 border border-surface-700 text-surface-300 hover:text-white hover:border-surface-500 disabled:opacity-40 rounded-xl text-xs font-medium transition-colors"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={onApprove}
                disabled={working}
                className="flex-[1.4] h-10 inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                {working && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {working ? "Enviando…" : "Aprobar y enviar"}
              </button>
            </>
          ) : esperando ? (
            <p className="text-[11px] text-surface-500 py-2 leading-relaxed">
              Lo tiene que aprobar el dueño o un administrador de tu organización.
            </p>
          ) : (
            <>
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setDraft(order.items);
                      setNotes(order.notes ?? "");
                    }}
                    className="h-9 px-3 border border-surface-700 text-surface-300 rounded-lg text-xs inline-flex items-center gap-1 hover:text-white"
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
                canEditItems && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="h-9 px-3 border border-surface-700 text-surface-200 hover:text-white rounded-lg text-xs inline-flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Ajustar costos
                  </button>
                )
              )}
              {offline && (
                <button
                  type="button"
                  onClick={() => void copyMessage()}
                  className="h-9 px-3 border border-amber-500/30 bg-amber-500/5 text-amber-100 hover:bg-amber-500/10 rounded-lg text-xs inline-flex items-center gap-1.5"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copiado" : "Copiar mensaje"}
                </button>
              )}
              {!editing && (
                <button
                  type="button"
                  onClick={() => void shareInChat()}
                  disabled={sharing}
                  className="h-9 px-3 border border-brand-500/30 bg-brand-600/10 text-brand-100 hover:bg-brand-600/20 disabled:opacity-40 rounded-lg text-xs inline-flex items-center gap-1.5"
                >
                  {sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  {shared ? "Avisado en NODO" : "Avisar al vendedor"}
                </button>
              )}
              {!offline && !editing && (
                <Link
                  href={providerOrdersHref(order.provider)}
                  className="h-9 px-3 inline-flex items-center gap-1.5 text-[11px] text-surface-400 hover:text-white border border-surface-800 hover:border-surface-600 rounded-lg transition-colors"
                >
                  Ver en {order.providerName}
                  <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function TaxPair({ percent, amount }: { percent: number; amount: number }) {
  if (!(amount > 0.0005) && !(percent > 0)) {
    return <p className="text-xs text-surface-600 tabular-nums">—</p>;
  }
  return (
    <>
      {percent > 0 && (
        <p className="text-[10px] text-surface-500 tabular-nums leading-none mb-0.5">
          {Number.isInteger(percent) ? percent : percent.toFixed(1)}%
        </p>
      )}
      <p className="text-xs text-surface-200 tabular-nums leading-tight">
        {amount > 0.0005 ? formatUSD(amount) : "—"}
      </p>
    </>
  );
}

function MetaChip({
  label, value, className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-surface-800 bg-surface-950/50 px-2.5 py-2 min-w-0 ${className}`}>
      <p className="text-[9px] uppercase tracking-wider text-surface-500 font-semibold">{label}</p>
      <p className="text-[11px] text-surface-200 mt-0.5 leading-snug line-clamp-2">{value}</p>
    </div>
  );
}

function Estado({
  esperando, creado, rechazado, offline,
}: {
  esperando: boolean; creado: boolean; rechazado: boolean; offline: boolean;
}) {
  const base = "inline-flex items-center gap-1 text-[10px] font-semibold flex-shrink-0 rounded-full px-2 py-1";
  if (esperando) {
    return (
      <span className={`${base} text-amber-300 bg-amber-500/15 ring-1 ring-amber-500/25`}>
        <Clock className="w-3 h-3" /> Esperando
      </span>
    );
  }
  if (rechazado) {
    return (
      <span className={`${base} text-surface-400 bg-surface-800 ring-1 ring-surface-700`}>
        <XCircle className="w-3 h-3" /> Rechazado
      </span>
    );
  }
  if (offline) {
    return (
      <span className={`${base} text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/20`}>
        <StickyNote className="w-3 h-3" /> Offline OK
      </span>
    );
  }
  if (creado) {
    return (
      <span className={`${base} text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/20`}>
        <CheckCircle2 className="w-3 h-3" /> Confirmado
      </span>
    );
  }
  return (
    <span className={`${base} text-red-300 bg-red-500/10 ring-1 ring-red-500/20`}>
      <XCircle className="w-3 h-3" /> Error
    </span>
  );
}

function fecha(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
