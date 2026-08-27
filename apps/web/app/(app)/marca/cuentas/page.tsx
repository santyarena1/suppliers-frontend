"use client";

import { useCallback, useEffect, useState } from "react";
import PrefsPanel from "@/components/PrefsPanel";
import { brandApi, type BrandAccounts } from "@/lib/api";
import { Handshake, Loader2 } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

const inputClass =
  "w-full bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500";

export default function BrandAccountsPage() {
  const [accounts, setAccounts] = useState<BrandAccounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [retailerId, setRetailerId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await brandApi.accounts();
    setAccounts(res.data);
    setRetailerId((current) => current || res.data.retailers[0]?.tenantId || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setAviso({ ok: false, text: errMsg(err, "No se pudieron cargar las cuentas") });
      setLoading(false);
    });
  }, [load]);

  async function send() {
    if (!retailerId || !title.trim() || !body.trim()) return;
    setSending(true);
    try {
      await brandApi.note({ retailerTenantId: retailerId, title: title.trim(), body: body.trim() });
      setTitle("");
      setBody("");
      setAviso({ ok: true, text: "Aviso enviado al comercio" });
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo enviar") });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Cuentas</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Solo aparecen los comercios vinculados. Un distribuidor no vinculado no existe para esta marca.
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
          {aviso && (
            <p className={`text-xs rounded-md px-3 py-2 ${aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {aviso.text}
            </p>
          )}
          {loading || !accounts ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <>
              <section>
                <h2 className="text-sm font-semibold text-white mb-2">Comercios vinculados</h2>
                {accounts.retailers.length === 0 ? (
                  <div className="border border-surface-800 rounded-xl p-6 text-center">
                    <Handshake className="w-8 h-8 text-surface-600 mx-auto mb-2" />
                    <p className="text-sm text-surface-400">Nadie canjeó un código todavía. Generá uno en Códigos.</p>
                  </div>
                ) : (
                  <div className="border border-surface-800 rounded-xl overflow-hidden divide-y divide-surface-800">
                    {accounts.retailers.map((row) => (
                      <div key={row.linkId} className="px-4 py-2.5 flex items-center justify-between">
                        <p className="text-sm text-surface-200">{row.name}</p>
                        <span className="text-[11px] text-surface-500">{row.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {accounts.retailers.length > 0 && (
                <section className="border border-surface-800 rounded-xl p-4 bg-surface-900 flex flex-col gap-2">
                  <h2 className="text-sm font-semibold text-white">Avisar a un comercio</h2>
                  <select className={inputClass} value={retailerId} onChange={(e) => setRetailerId(e.target.value)}>
                    {accounts.retailers.map((row) => (
                      <option key={row.tenantId} value={row.tenantId}>{row.name}</option>
                    ))}
                  </select>
                  <input className={inputClass} placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <textarea className={`${inputClass} min-h-[72px]`} placeholder="Mensaje" value={body} onChange={(e) => setBody(e.target.value)} />
                  <button
                    onClick={send}
                    disabled={sending}
                    className="self-start bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 py-2"
                  >
                    {sending ? "Enviando…" : "Enviar aviso"}
                  </button>
                </section>
              )}

              <section>
                <h2 className="text-sm font-semibold text-white mb-2">Distribuidores de la plataforma</h2>
                <p className="text-[11px] text-surface-500 mb-2">
                  Sirven para acotar una acción a ciertos mayoristas. El comercio sigue comprando en su cuenta de cada uno.
                </p>
                <div className="border border-surface-800 rounded-xl overflow-hidden divide-y divide-surface-800">
                  {accounts.distributors.map((row) => (
                    <div key={row.id} className="px-4 py-2.5 flex items-center justify-between">
                      <p className="text-sm text-surface-200">{row.name}</p>
                      {row.providerKey && <span className="text-[11px] text-surface-500 font-mono">{row.providerKey}</span>}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
