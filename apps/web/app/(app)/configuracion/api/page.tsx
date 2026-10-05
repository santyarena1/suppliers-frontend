"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Plus, RefreshCw } from "lucide-react";
import PrefsPanel from "@/components/PrefsPanel";
import AddonCard from "@/components/catalog-api/AddonCard";
import ClientCard from "@/components/catalog-api/ClientCard";
import CreateClientModal from "@/components/catalog-api/CreateClientModal";
import QuickStart from "@/components/catalog-api/QuickStart";
import { SecretReveal, apiMessage, ghostBtn, primaryBtn } from "@/components/catalog-api/ui";
import { catalogApiAdmin } from "@/lib/api";
import type { ApiClientView, CatalogApiOverview } from "@/lib/catalog-api";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

/**
 * Configuración → API de catálogo: el módulo, las keys con su configuración,
 * webhooks, uso y feeds. Diseño en docs/PLAN_API_CATALOGO.md.
 */
export default function CatalogApiPage() {
  const [data, setData] = useState<CatalogApiOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [addonBusy, setAddonBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ client: ApiClientView; secret: string } | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await catalogApiAdmin.overview();
      setData(res.data);
    } catch (err) {
      setError(apiMessage(err, "No se pudo cargar la API de catálogo"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const onMessage = useCallback((ok: boolean, text: string) => setAviso({ ok, text }), []);

  function replaceClient(next: ApiClientView) {
    setData((prev) => (prev ? { ...prev, clients: prev.clients.map((c) => (c.id === next.id ? next : c)) } : prev));
  }

  async function toggleAddon(enabled: boolean) {
    setAddonBusy(true);
    try {
      const res = await catalogApiAdmin.setAddon(enabled);
      setData((prev) => (prev ? { ...prev, addon: res.data.addon } : prev));
      setAviso({
        ok: true,
        text: enabled ? "Módulo activado. Ya podés crear tus keys." : "Módulo desactivado. Tus keys dejaron de responder.",
      });
    } catch (err) {
      setAviso({ ok: false, text: apiMessage(err, "No se pudo cambiar el módulo") });
    } finally {
      setAddonBusy(false);
    }
  }

  const enabled = !!data && (data.addon.includedInPlan || data.addon.enabled);
  const active = data?.clients.filter((c) => c.status === "ACTIVE") ?? [];
  const revoked = data?.clients.filter((c) => c.status === "REVOKED") ?? [];
  const baseUrl = data?.baseUrl || API_BASE;
  const docsUrl = data?.docsUrl || "/developers";

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/configuracion" className="text-surface-500 hover:text-white" aria-label="Volver a Configuración">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-white">API de catálogo</h1>
            <p className="text-xs text-surface-500 hidden sm:block">Tu catálogo de NODO en tu tienda, tu ERP, Google y Meta</p>
          </div>
        </div>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
          {aviso && (
            <p
              role="status"
              className={`text-xs rounded-md px-3 py-2 ${aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}
            >
              {aviso.text}
            </p>
          )}

          {loading ? (
            <div className="flex flex-col gap-4" aria-busy="true">
              <div className="h-48 rounded-xl border border-surface-800 bg-surface-900/50 animate-pulse" />
              <div className="h-20 rounded-xl border border-surface-800 bg-surface-900/50 animate-pulse" />
              <div className="h-20 rounded-xl border border-surface-800 bg-surface-900/50 animate-pulse" />
            </div>
          ) : error || !data ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-8 text-center">
              <p className="text-sm text-red-300">{error ?? "No se pudo cargar"}</p>
              <button type="button" onClick={() => { setLoading(true); void load(); }} className={`${ghostBtn} mt-4`}>
                <RefreshCw className="w-3.5 h-3.5" /> Reintentar
              </button>
            </div>
          ) : (
            <>
              <AddonCard addon={data.addon} canManage={data.canManage} busy={addonBusy} onToggle={(v) => void toggleAddon(v)} />

              {enabled && (
                <>
                  <section className="flex flex-col gap-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-white">Keys</h2>
                        <p className="text-xs text-surface-400 mt-0.5">
                          Una por cada sistema que conectes: así cada una tiene su configuración y la podés revocar sin tocar las demás.
                        </p>
                      </div>
                      {data.canManage && (
                        <button type="button" onClick={() => setCreating(true)} className={`${primaryBtn} flex-shrink-0`}>
                          <Plus className="w-3.5 h-3.5" /> Nueva key
                        </button>
                      )}
                    </div>

                    {active.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-surface-700 px-4 py-10 text-center">
                        <KeyRound className="mx-auto w-6 h-6 text-surface-600" />
                        <p className="mt-3 text-sm text-surface-200">Todavía no creaste ninguna key</p>
                        <p className="mt-1 text-xs text-surface-500">
                          {data.canManage ? "Creá una para tu tienda o tu ERP y probala con el ejemplo de abajo." : "El dueño o un administrador puede crearlas."}
                        </p>
                        {data.canManage && (
                          <button type="button" onClick={() => setCreating(true)} className={`${primaryBtn} mt-4`}>
                            <Plus className="w-3.5 h-3.5" /> Crear la primera key
                          </button>
                        )}
                      </div>
                    ) : (
                      active.map((c, i) => (
                        <ClientCard
                          key={c.id}
                          client={c}
                          providers={data.providers}
                          canManage={data.canManage}
                          defaultOpen={i === 0 && active.length === 1}
                          onChange={replaceClient}
                          onMessage={onMessage}
                        />
                      ))
                    )}

                    {revoked.length > 0 && (
                      <div>
                        <button type="button" onClick={() => setShowRevoked((v) => !v)} className="text-xs text-surface-500 hover:text-white">
                          {showRevoked ? "Ocultar" : "Ver"} {revoked.length} {revoked.length === 1 ? "key revocada" : "keys revocadas"}
                        </button>
                        {showRevoked && (
                          <div className="mt-3 flex flex-col gap-3">
                            {revoked.map((c) => (
                              <ClientCard key={c.id} client={c} providers={data.providers} canManage={data.canManage} onChange={replaceClient} onMessage={onMessage} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  <QuickStart baseUrl={baseUrl} docsUrl={docsUrl} publicKey={active[0]?.publicKey} />
                </>
              )}

              {!enabled && (
                <QuickStart baseUrl={baseUrl} docsUrl={docsUrl} />
              )}
            </>
          )}
        </div>
      </div>

      {creating && (
        <CreateClientModal
          onClose={() => setCreating(false)}
          onCreated={(client, secret) => {
            setCreating(false);
            setData((prev) => (prev ? { ...prev, clients: [client, ...prev.clients] } : prev));
            setCreated({ client, secret });
          }}
        />
      )}
      {created && (
        <SecretReveal
          title={`Key «${created.client.name}» creada`}
          lead="Copiá el secret ahora: es la única vez que lo vas a ver. Guardalo en una variable de entorno o un gestor de secretos."
          items={[
            { label: "API key", value: created.client.publicKey },
            { label: "API secret", value: created.secret },
          ]}
          footnote="Si lo perdés, rotalo desde la key: te damos uno nuevo y el anterior sigue funcionando 24 horas."
          onClose={() => setCreated(null)}
        />
      )}
    </>
  );
}
