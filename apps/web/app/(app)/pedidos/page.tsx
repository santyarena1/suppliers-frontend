"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { ordersApi, type TenantOrder } from "@/lib/api";
import { getTenant } from "@/lib/auth";
import { providerOrdersHref } from "@/lib/providerOrders";
import ProviderBadge from "@/components/ProviderBadge";
import { buildSellerMessageFromOrder } from "@/lib/seller-message";
import { formatUSD } from "@/lib/format";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  ExternalLink,
  Inbox,
  Loader2,
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
 */
export default function PedidosPage() {
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
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
  const lineas = order.items.length;
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(esperando);
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

  const totalLabel = order.total != null
    ? order.total.toLocaleString("es-AR", { style: "currency", currency: "USD" })
    : null;

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
      <div className="p-4 flex flex-col gap-3">
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
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[11px] text-surface-500">
              <span>{lineas} línea{lineas === 1 ? "" : "s"}</span>
              {totalLabel && (
                <>
                  <span className="text-surface-700">·</span>
                  <span className="tabular-nums text-surface-300 font-medium">{totalLabel}</span>
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

        {(order.webOrderNumber || order.orderNumber) && (
          <p className="text-[11px] font-mono text-surface-500 bg-surface-950/60 rounded-lg px-2.5 py-1.5 inline-flex w-fit">
            {order.webOrderNumber ? `Web #${order.webOrderNumber}` : `Orden #${order.orderNumber}`}
          </p>
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
        {offline && editing ? (
          <div className="flex flex-col gap-2.5 border-t border-surface-800 pt-3">
            {draft.map((it, idx) => (
              <div key={`${it.externalId || it.code || idx}`} className="flex items-start gap-2 rounded-lg bg-surface-950/50 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-surface-200 leading-snug font-medium">{it.name}</p>
                  <div className="flex gap-3 mt-2">
                    <label className="text-[10px] text-surface-500 flex items-center gap-1.5">
                      Cant.
                      <input
                        type="number"
                        min={1}
                        value={it.qty ?? 1}
                        onChange={(e) => {
                          const qty = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setDraft((prev) => prev.map((row, i) => i === idx ? { ...row, qty } : row));
                        }}
                        className="w-14 bg-surface-800 border border-surface-700 rounded-md px-1.5 py-1 text-xs text-white tabular-nums"
                      />
                    </label>
                    <label className="text-[10px] text-surface-500 flex items-center gap-1.5">
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
                        className="w-24 bg-surface-800 border border-surface-700 rounded-md px-1.5 py-1 text-xs text-white tabular-nums"
                      />
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-surface-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10"
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
              className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-xs text-white placeholder-surface-500 resize-none"
            />
          </div>
        ) : order.items.length > 0 ? (
          <div className="border-t border-surface-800 pt-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex items-center justify-between gap-2 py-1 text-[11px] text-surface-400 hover:text-surface-200"
            >
              <span>{expanded ? "Ocultar productos" : `Ver ${lineas} producto${lineas === 1 ? "" : "s"}`}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`} />
            </button>
            {expanded && (
              <ul className="mt-1.5 space-y-1">
                {(order.items.length > 8 && !esperando ? order.items.slice(0, 8) : order.items).map((it, i) => (
                  <li
                    key={`${it.externalId || it.code || i}`}
                    className="flex items-baseline justify-between gap-3 text-[11px] rounded-md px-2 py-1.5 bg-surface-950/40"
                  >
                    <span className="text-surface-300 min-w-0 truncate">
                      <span className="text-surface-500 tabular-nums mr-1.5">{it.qty ?? 1}×</span>
                      {it.name}
                    </span>
                    {it.unitPrice != null && (
                      <span className="tabular-nums text-surface-500 flex-shrink-0">{formatUSD(it.unitPrice)}</span>
                    )}
                  </li>
                ))}
                {order.items.length > 8 && !esperando && (
                  <li className="text-[11px] text-surface-600 px-2 py-1">+{order.items.length - 8} más</li>
                )}
              </ul>
            )}
          </div>
        ) : null}

        {/* Acciones */}
        <div className="flex items-center gap-2 pt-1 border-t border-surface-800 flex-wrap">
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
          ) : offline ? (
            <>
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
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
                    Guardar
                  </button>
                </>
              ) : (
                order.editable && (
                  <button
                    type="button"
                    onClick={() => { setEditing(true); setExpanded(true); }}
                    className="h-9 px-3 border border-surface-700 text-surface-200 hover:text-white rounded-lg text-xs inline-flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => void copyMessage()}
                className="h-9 px-3 border border-amber-500/30 bg-amber-500/5 text-amber-100 hover:bg-amber-500/10 rounded-lg text-xs inline-flex items-center gap-1.5"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado" : "Copiar mensaje"}
              </button>
            </>
          ) : (
            <Link
              href={providerOrdersHref(order.provider)}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-[11px] text-surface-400 hover:text-white border border-surface-800 hover:border-surface-600 rounded-lg transition-colors"
            >
              Ver en {order.providerName}
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
    </article>
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
