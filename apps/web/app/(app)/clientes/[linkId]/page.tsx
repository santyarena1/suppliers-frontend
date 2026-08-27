"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PrefsPanel from "@/components/PrefsPanel";
import {
  TENANT_LINK_STATUS_LABELS,
  myApi,
  orgCartApi,
  type OwnClientDetail,
  type OwnPortfolio,
  type TenantLinkStatus,
} from "@/lib/api";
import { formatUSD } from "@/lib/format";
import { ArrowLeft, Loader2, MessageSquare, ShoppingCart } from "lucide-react";

const inputClass =
  "bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

type CartLine = {
  name?: string;
  qty?: number;
  provider?: string;
  price?: string | number;
  channel?: string;
};

export default function ClienteDetallePage() {
  const params = useParams<{ linkId: string }>();
  const linkId = params.linkId;
  const [detail, setDetail] = useState<OwnClientDetail | null>(null);
  const [portfolio, setPortfolio] = useState<OwnPortfolio | null>(null);
  const [cart, setCart] = useState<{ items: CartLine[]; updatedAt: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [clientRes, listRes, cartRes] = await Promise.all([
      myApi.client(linkId),
      myApi.clients(),
      orgCartApi.client(linkId).catch(() => null),
    ]);
    setDetail(clientRes.data);
    setPortfolio(listRes.data);
    if (cartRes) {
      setCart({
        items: Array.isArray(cartRes.data.items) ? (cartRes.data.items as CartLine[]) : [],
        updatedAt: cartRes.data.updatedAt,
      });
    }
    setLoading(false);
  }, [linkId]);

  useEffect(() => {
    load().catch((err) => {
      setAviso({ ok: false, text: errMsg(err, "No se pudo cargar el cliente") });
      setLoading(false);
    });
  }, [load]);

  async function patch(data: Parameters<typeof myApi.updateClient>[1], ok: string) {
    try {
      await myApi.updateClient(linkId, data);
      setAviso({ ok: true, text: ok });
      await load();
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo guardar") });
    }
  }

  const cartCount = cart?.items.reduce((sum, item) => sum + (item.qty ?? 0), 0) ?? 0;

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/clientes" className="text-surface-500 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-white truncate">{detail?.client.name ?? "Cliente"}</h1>
            <p className="text-xs text-surface-500">Pedidos, carrito y condiciones del vínculo</p>
          </div>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
          {aviso && (
            <p className={`text-xs rounded-md px-3 py-2 ${aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {aviso.text}
            </p>
          )}
          {loading || !detail ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <>
              <section className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex flex-wrap gap-3">
                  <label className="flex flex-col gap-1 text-[11px] text-surface-500">
                    Estado
                    {portfolio?.canAssignSeller ? (
                      <select
                        value={detail.status}
                        onChange={(e) => patch({ status: e.target.value as TenantLinkStatus }, "Estado actualizado")}
                        className={inputClass}
                      >
                        {Object.entries(TENANT_LINK_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-surface-200">{TENANT_LINK_STATUS_LABELS[detail.status]}</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-surface-500">
                    Vendedor
                    {portfolio?.canAssignSeller ? (
                      <select
                        value={detail.accountManager?.id ?? ""}
                        onChange={(e) =>
                          patch({ accountManagerId: e.target.value || null }, "Vendedor actualizado")
                        }
                        className={inputClass}
                      >
                        <option value="">Sin asignar</option>
                        {(portfolio?.sellers ?? []).map((seller) => (
                          <option key={seller.userId} value={seller.userId}>
                            {seller.username}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-surface-200">{detail.accountManager?.username ?? "Sin asignar"}</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-surface-500">
                    Descuento %
                    {portfolio?.canEditTerms ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={detail.discountPercent ?? ""}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const next = raw === "" ? null : Number(raw);
                          if (next === detail.discountPercent) return;
                          patch({ discountPercent: next }, "Descuento actualizado");
                        }}
                        className={`${inputClass} w-24`}
                      />
                    ) : (
                      <span className="text-sm text-surface-200">
                        {detail.discountPercent != null ? `${detail.discountPercent}%` : "Sin descuento"}
                      </span>
                    )}
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-[11px] text-surface-500">
                  Notas
                  {portfolio?.canEditTerms ? (
                    <textarea
                      defaultValue={detail.notes ?? ""}
                      rows={2}
                      onBlur={(e) => {
                        const next = e.target.value.trim() || null;
                        if (next === (detail.notes ?? null)) return;
                        patch({ notes: next }, "Notas guardadas");
                      }}
                      className={`${inputClass} w-full`}
                    />
                  ) : (
                    <span className="text-sm text-surface-200">{detail.notes || "Sin notas"}</span>
                  )}
                </label>
                {(detail.client.contactEmail || detail.client.contactPhone) && (
                  <p className="text-[11px] text-surface-500">
                    Contacto: {[detail.client.contactEmail, detail.client.contactPhone].filter(Boolean).join(" · ")}
                  </p>
                )}
                {detail.status !== "REVOKED" && (
                  <Link
                    href={`/mensajes?linkId=${detail.linkId}`}
                    className="self-start inline-flex items-center gap-1.5 mt-1 text-xs font-medium bg-brand-600/15 hover:bg-brand-600/25 text-brand-200 rounded-lg px-3 py-2"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Hablar con el comercio
                  </Link>
                )}
              </section>

              <section className="border border-surface-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-800">
                  <ShoppingCart className="w-3.5 h-3.5 text-surface-400" />
                  <h2 className="text-xs font-semibold text-white">Carrito del local</h2>
                  <span className="text-[11px] text-surface-500">{cartCount} ítems</span>
                </div>
                {!cart || cart.items.length === 0 ? (
                  <p className="text-xs text-surface-500 px-4 py-6">
                    Este comercio todavía no armó el carrito. Cuando lo haga, acá se ve el mismo que usan ellos.
                  </p>
                ) : (
                  <div className="divide-y divide-surface-800">
                    {cart.items.slice(0, 40).map((item, index) => (
                      <div key={`${item.provider}-${item.name}-${index}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <p className="text-sm text-surface-200 flex-1 min-w-[140px]">{item.name ?? "Producto"}</p>
                        <span className="text-[11px] text-surface-500">{item.provider}</span>
                        <span className="text-[11px] text-surface-400">×{item.qty ?? 1}</span>
                        {item.channel === "offline" && (
                          <span className="text-[10px] text-amber-400">offline</span>
                        )}
                      </div>
                    ))}
                    {cart.updatedAt && (
                      <p className="text-[11px] text-surface-600 px-4 py-2">
                        Actualizado {new Date(cart.updatedAt).toLocaleString("es-AR")}
                      </p>
                    )}
                  </div>
                )}
              </section>

              <section className="border border-surface-800 rounded-xl overflow-hidden">
                <h2 className="text-xs font-semibold text-white px-4 py-3 border-b border-surface-800">Pedidos</h2>
                {detail.orders.length === 0 ? (
                  <p className="text-xs text-surface-500 px-4 py-6">Este comercio todavía no tiene pedidos en NODO.</p>
                ) : (
                  <div className="divide-y divide-surface-800">
                    {detail.orders.map((order) => (
                      <div key={order.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <p className="text-sm text-surface-200 flex-1 min-w-[120px]">{order.providerName}</p>
                        <span className="text-[11px] text-surface-400">{order.status}</span>
                        <span className="text-[11px] text-surface-400 tabular-nums">
                          {order.total != null ? formatUSD(order.total) : "—"}
                        </span>
                        <span className="text-[11px] text-surface-500">
                          {new Date(order.createdAt).toLocaleString("es-AR")}
                        </span>
                      </div>
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
