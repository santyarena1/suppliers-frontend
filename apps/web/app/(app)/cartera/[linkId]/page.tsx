"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PrefsPanel from "@/components/PrefsPanel";
import ChatThread from "@/components/ChatThread";
import { portfolioApi, type ClientDetail, type PortfolioSeller } from "@/lib/api";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function ClientePage() {
  const params = useParams<{ linkId: string }>();
  const linkId = params.linkId;
  const [data, setData] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await portfolioApi.client(linkId);
      setData(res.data);
      setError(null);
    } catch (err: unknown) {
      const text = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(text || "Cliente no encontrado");
    } finally {
      setLoading(false);
    }
  }, [linkId]);

  useEffect(() => { void load(); }, [load]);

  async function save(patch: { accountManagerId?: string | null; discountPercent?: number | null }) {
    setSaving(true);
    setMsg(null);
    try {
      await portfolioApi.updateClient(linkId, patch);
      await load();
      setMsg("Guardado");
    } catch (err: unknown) {
      const text = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMsg(text || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/cartera" className="text-surface-400 hover:text-white" aria-label="Volver a la cartera">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-white truncate">{data?.commerce.name ?? "Cliente"}</h1>
            <p className="text-xs text-surface-500 truncate">
              {data?.commerce.contactEmail ?? "Sin email"}
              {data?.commerce.contactPhone ? ` · ${data.commerce.contactPhone}` : ""}
            </p>
          </div>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : error || !data ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : (
            <>
              <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5 grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-surface-500 mb-1.5">Vendedor asignado</label>
                  {data.canAssignSeller ? (
                    <select
                      value={data.accountManager?.id ?? ""}
                      disabled={saving}
                      onChange={(e) => save({ accountManagerId: e.target.value || null })}
                      className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white"
                    >
                      <option value="">Sin asignar</option>
                      {(data.sellers ?? []).map((seller: PortfolioSeller) => (
                        <option key={seller.id} value={seller.id}>{seller.username}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-surface-200">{data.accountManager?.username ?? "Sin asignar"}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-surface-500 mb-1.5">Descuento (%)</label>
                  {data.canEditDiscount ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      defaultValue={data.discountPercent ?? ""}
                      disabled={saving}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const value = raw === "" ? null : Number(raw);
                        if (value === data.discountPercent) return;
                        if (value != null && (Number.isNaN(value) || value < 0 || value > 100)) return;
                        void save({ discountPercent: value });
                      }}
                      className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  ) : (
                    <p className="text-sm text-surface-200">{data.discountPercent != null ? `${data.discountPercent}%` : "Sin descuento"}</p>
                  )}
                  <p className="text-[11px] text-surface-600 mt-1">El comercio no ve este número. Se aplica al precio de catálogo al leerlo.</p>
                </div>
              </section>
              {msg && <p className="text-xs text-surface-400 -mt-3">{msg}</p>}

              <section className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-white mb-3">Pedidos</h2>
                {data.orders.length === 0 ? (
                  <p className="text-xs text-surface-500">Todavía no hay pedidos de este local.</p>
                ) : (
                  <div className="divide-y divide-surface-800">
                    {data.orders.map((order) => (
                      <div key={order.id} className="flex justify-between py-2 text-sm">
                        <span className="text-surface-300">{order.createdBy ?? "—"} · {order.itemsCount} ítems</span>
                        <span className="text-surface-500">
                          {order.approvalStatus === "PENDING_APPROVAL" ? "Esperando firma" : order.status}
                          {order.total != null ? ` · ${order.total}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <ChatThread linkId={linkId} otherName={data.commerce.name} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
