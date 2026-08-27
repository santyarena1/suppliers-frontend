"use client";

import { useCallback, useEffect, useState } from "react";
import PrefsPanel from "@/components/PrefsPanel";
import AccessCodeQr from "@/components/org/AccessCodeQr";
import { myApi, type TenantAccessCode } from "@/lib/api";
import { getTenant } from "@/lib/auth";
import { Copy, Loader2, QrCode, X } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

/**
 * Códigos de vinculación del distribuidor. Se entregan por fuera de NODO;
 * el comercio los canjea sin saber de quién son hasta que salen bien.
 */
export default function CodigosPage() {
  const [codes, setCodes] = useState<TenantAccessCode[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const orgName = getTenant()?.name ?? null;

  const load = useCallback(async () => {
    const res = await myApi.accessCodes();
    setCodes(res.data.codes);
    setCanManage(res.data.canManage);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setAviso({ ok: false, text: errMsg(err, "No se pudieron cargar los códigos") });
      setLoading(false);
    });
  }, [load]);

  const active = codes.filter((code) => !code.revoked);

  async function create() {
    setCreating(true);
    try {
      await myApi.createAccessCode({
        label: label.trim() || undefined,
        maxUses: Math.max(1, Number(maxUses) || 1),
        expiresInDays: expiresInDays ? Math.max(1, Number(expiresInDays)) : undefined,
      });
      setLabel("");
      setMaxUses("1");
      setExpiresInDays("");
      setAviso({ ok: true, text: "Código generado" });
      await load();
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo generar el código") });
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Códigos de vinculación</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Entregalos por WhatsApp o en papel. El comercio los canjea en Proveedores.
          </p>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
          {aviso && (
            <p className={`text-xs rounded-md px-3 py-2 ${aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {aviso.text}
            </p>
          )}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <section className="border border-surface-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <QrCode className="w-3.5 h-3.5 text-surface-400" />
                <h2 className="text-xs font-semibold text-white">Activos ({active.length})</h2>
              </div>
              <p className="text-[11px] text-surface-500 mb-3 leading-relaxed">
                El canje no revela a qué organización pertenece el código hasta que sale bien.
              </p>
              {active.length === 0 ? (
                <p className="text-xs text-surface-500 mb-3">No hay códigos activos.</p>
              ) : (
                <div className="border border-surface-800 rounded-lg divide-y divide-surface-800 mb-3">
                  {active.map((code) => (
                    <div key={code.id} className="flex items-center gap-2 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono text-surface-200 tracking-wide">{code.code}</p>
                        <p className="text-[11px] text-surface-500">
                          {code.label || "Sin etiqueta"} · {code.usedCount} de {code.maxUses} usos
                          {code.expiresAt
                            ? ` · vence ${new Date(code.expiresAt).toLocaleDateString("es-AR")}`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(code.code);
                          setAviso({ ok: true, text: "Código copiado" });
                        }}
                        className="text-surface-500 hover:text-surface-200"
                        aria-label="Copiar"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <AccessCodeQr code={code.code} label={code.label} orgName={orgName} />
                      {canManage && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await myApi.revokeAccessCode(code.id);
                              setAviso({ ok: true, text: "Código revocado" });
                              await load();
                            } catch (err) {
                              setAviso({ ok: false, text: errMsg(err, "No se pudo revocar") });
                            }
                          }}
                          className="text-surface-500 hover:text-red-400"
                          aria-label="Revocar"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {canManage && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Etiqueta (opcional)"
                    className="flex-1 bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
                  />
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    title="Usos máximos"
                    className="w-20 bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white"
                  />
                  <select
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="">Sin vencimiento</option>
                    <option value="7">7 días</option>
                    <option value="30">30 días</option>
                    <option value="90">90 días</option>
                  </select>
                  <button
                    type="button"
                    onClick={create}
                    disabled={creating}
                    className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg px-3.5 py-2"
                  >
                    {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Generar
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
