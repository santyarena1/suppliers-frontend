"use client";

import { useCallback, useEffect, useState } from "react";
import PrefsPanel from "@/components/PrefsPanel";
import AccessCodeQr from "@/components/AccessCodeQr";
import { portfolioApi, type DistributorAccessCode } from "@/lib/api";
import { Check, Copy, Loader2, QrCode, Ticket } from "lucide-react";

export default function CodigosPage() {
  const [codes, setCodes] = useState<DistributorAccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await portfolioApi.accessCodes();
      setCodes(res.data);
      setError(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudieron cargar los códigos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await portfolioApi.createAccessCode({
        label: label.trim() || undefined,
        maxUses,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      });
      setLabel("");
      setMaxUses(1);
      setExpiresInDays("");
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "No se pudo generar el código");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("¿Revocar este código? Los que ya se canjearon siguen vinculados.")) return;
    await portfolioApi.revokeAccessCode(id);
    await load();
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    window.setTimeout(() => setCopied(null), 1500);
  }

  const activos = codes.filter((c) => !c.revoked);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Códigos</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            El comercio lo tipea o escanea el QR. Hasta que lo canjea, no se revela quién sos.
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
          <form onSubmit={create} className="bg-surface-900 border border-surface-800 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-brand-400" />
              <h2 className="text-sm font-semibold text-white">Generar código</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Etiqueta (opcional)"
                className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
              />
              <input
                type="number"
                min={1}
                max={500}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
                className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white"
                aria-label="Usos máximos"
              />
              <input
                type="number"
                min={1}
                max={365}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                placeholder="Vence en (días)"
                className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
              />
            </div>
            <p className="text-[11px] text-surface-500">Usos: cuántos locales pueden canjearlo. Vacío en vencimiento = no vence.</p>
            <button
              type="submit"
              disabled={creating}
              className="self-start flex items-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              Generar
            </button>
          </form>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : activos.length === 0 ? (
            <p className="text-sm text-surface-400">Todavía no hay códigos activos.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {activos.map((code) => (
                <article key={code.id} className="bg-surface-900 border border-surface-800 rounded-2xl p-5 flex flex-col items-center gap-3">
                  <AccessCodeQr value={code.code} />
                  <p className="font-mono text-lg tracking-widest text-white">{code.code}</p>
                  {code.label && <p className="text-xs text-surface-400">{code.label}</p>}
                  <p className="text-[11px] text-surface-500">
                    {code.usedCount}/{code.maxUses} usos
                    {code.expiresAt ? ` · vence ${new Date(code.expiresAt).toLocaleDateString("es-AR")}` : ""}
                  </p>
                  {code.redemptions.length > 0 && (
                    <p className="text-[11px] text-surface-400 text-center">
                      Canjeado por {code.redemptions.map((r) => r.commerceName).join(", ")}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => copy(code.code)}
                      className="flex items-center gap-1.5 text-xs border border-surface-700 rounded-md px-2.5 py-1.5 text-surface-300 hover:text-white"
                    >
                      {copied === code.code ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      Copiar
                    </button>
                    <button
                      type="button"
                      onClick={() => revoke(code.id)}
                      className="text-xs border border-surface-700 rounded-md px-2.5 py-1.5 text-red-300 hover:text-red-200"
                    >
                      Revocar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
