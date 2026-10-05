"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ChevronDown, KeyRound, Loader2, Rss, Settings2, ShieldAlert, Webhook } from "lucide-react";
import { catalogApiAdmin } from "@/lib/api";
import { CATALOG_API_SCOPES, CATALOG_API_SCOPE_LABELS, type ApiClientConfig, type ApiClientView, type CatalogApiScope } from "@/lib/catalog-api";
import ConfigEditor from "./ConfigEditor";
import UsageChart from "./UsageChart";
import WebhooksPanel from "./WebhooksPanel";
import { parseIpList } from "./CreateClientModal";
import {
  CopyButton,
  CopyField,
  Field,
  SecretReveal,
  StatusPill,
  apiMessage,
  dangerBtn,
  fmtAgo,
  fmtDateTime,
  ghostBtn,
  inputClass,
  isPast,
  primaryBtn,
} from "./ui";

type Tab = "config" | "webhooks" | "usage" | "access";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "config", label: "Configuración", icon: Settings2 },
  { key: "webhooks", label: "Webhooks", icon: Webhook },
  { key: "usage", label: "Uso", icon: BarChart3 },
  { key: "access", label: "Acceso y feeds", icon: KeyRound },
];

function sameConfig(a: ApiClientConfig, b: ApiClientConfig) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Una key: resumen arriba y, al abrirla, su configuración, webhooks, uso y acceso. */
export default function ClientCard({
  client,
  providers,
  canManage,
  defaultOpen,
  onChange,
  onMessage,
}: {
  client: ApiClientView;
  providers: { key: string; label: string }[];
  canManage: boolean;
  defaultOpen?: boolean;
  onChange: (next: ApiClientView) => void;
  onMessage: (ok: boolean, text: string) => void;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [tab, setTab] = useState<Tab>("config");
  const [draft, setDraft] = useState<ApiClientConfig>(client.config);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ value: string; until: string } | null>(null);
  const revoked = client.status === "REVOKED";
  const expired = isPast(client.expiresAt);
  const readOnly = !canManage || revoked;
  const dirty = !sameConfig(draft, client.config);

  useEffect(() => {
    setDraft(client.config);
  }, [client.config]);

  async function saveConfig() {
    setSaving(true);
    try {
      const res = await catalogApiAdmin.updateClient(client.id, { config: draft });
      onChange(res.data.client);
      onMessage(true, "Configuración guardada. Ya aplica en los próximos pedidos.");
    } catch (err) {
      onMessage(false, apiMessage(err, "No se pudo guardar la configuración"));
    } finally {
      setSaving(false);
    }
  }

  async function run<T>(key: string, action: () => Promise<T>, ok: string | null, fallback: string): Promise<T | null> {
    setBusy(key);
    try {
      const res = await action();
      if (ok) onMessage(true, ok);
      return res;
    } catch (err) {
      onMessage(false, apiMessage(err, fallback));
      return null;
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className={`rounded-xl border ${revoked ? "border-surface-800/60 opacity-75" : "border-surface-800"} bg-surface-950`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:justify-between hover:bg-surface-900/40 rounded-xl"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{client.name}</span>
            {revoked ? (
              <StatusPill tone="bad">Revocada</StatusPill>
            ) : expired ? (
              <StatusPill tone="warn">Vencida</StatusPill>
            ) : (
              <StatusPill tone="ok">Activa</StatusPill>
            )}
            <code className="text-[11px] text-surface-400 font-mono">{client.publicKey}</code>
          </div>
          <p className="mt-1 text-[11px] text-surface-500">
            Secret ••••{client.secretLast4} · último uso {fmtAgo(client.lastUsedAt)}
            {client.lastUsedIp ? ` desde ${client.lastUsedIp}` : ""} · {client.scopes.length}{" "}
            {client.scopes.length === 1 ? "permiso" : "permisos"}
            {client.expiresAt ? ` · vence ${fmtDateTime(client.expiresAt)}` : ""}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-surface-500 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-surface-800">
          <div className="flex overflow-x-auto border-b border-surface-800 px-2" role="tablist">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  tab === key ? "border-brand-500 text-white" : "border-transparent text-surface-400 hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "config" && (
              <>
                <ConfigEditor value={draft} onChange={setDraft} providers={providers} readOnly={readOnly} />
                {!readOnly && (
                  <div className={`${dirty ? "sticky bottom-0 z-10 shadow-[0_-12px_24px_-12px_rgb(0_0_0/0.6)]" : ""} mt-5 -mx-4 -mb-4 flex items-center justify-end gap-2 border-t border-surface-800 bg-surface-950 px-4 py-3 rounded-b-xl`}>
                    {dirty && <span className="mr-auto text-[11px] text-amber-300">Hay cambios sin guardar</span>}
                    <button type="button" disabled={!dirty || saving} onClick={() => setDraft(client.config)} className={ghostBtn}>
                      Descartar
                    </button>
                    <button type="button" disabled={!dirty || saving} onClick={() => void saveConfig()} className={primaryBtn}>
                      {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar configuración
                    </button>
                  </div>
                )}
              </>
            )}

            {tab === "webhooks" && <WebhooksPanel clientId={client.id} readOnly={readOnly} onMessage={onMessage} />}

            {tab === "usage" && (
              <div>
                <UsageChart clientId={client.id} />
                <p className="mt-3 text-[11px] text-surface-500">
                  Límite: {client.rateLimitPerMinute} pedidos por minuto. Cada respuesta trae X-RateLimit-Remaining.
                </p>
              </div>
            )}

            {tab === "access" && (
              <AccessTab
                client={client}
                readOnly={readOnly}
                busy={busy}
                onRotate={async () => {
                  if (!window.confirm("¿Generar un secret nuevo? El actual sigue funcionando 24 horas para que actualices tus sistemas.")) return;
                  const res = await run("rotate", () => catalogApiAdmin.rotateSecret(client.id), null, "No se pudo rotar el secret");
                  if (res) {
                    onChange(res.data.client);
                    setSecret({ value: res.data.secret, until: res.data.previousValidUntil });
                  }
                }}
                onRotateFeed={async () => {
                  if (!window.confirm("¿Generar links de feed nuevos? Los actuales dejan de funcionar enseguida: actualizalos en Google y Meta.")) return;
                  const res = await run("feed", () => catalogApiAdmin.rotateFeedToken(client.id), "Links de feed nuevos generados", "No se pudieron rotar los links");
                  if (res) onChange(res.data.client);
                }}
                onRevoke={async () => {
                  if (!window.confirm(`¿Revocar «${client.name}»? Deja de funcionar enseguida y no se puede deshacer.`)) return;
                  const res = await run("revoke", () => catalogApiAdmin.revoke(client.id), "Key revocada", "No se pudo revocar");
                  if (res) onChange(res.data.client);
                }}
                onSaveAccess={async (data) => {
                  const res = await run("access", () => catalogApiAdmin.updateClient(client.id, data), "Acceso actualizado", "No se pudo guardar");
                  if (res) onChange(res.data.client);
                }}
              />
            )}
          </div>
        </div>
      )}

      {secret && (
        <SecretReveal
          title="Secret nuevo"
          lead="Este es el secret nuevo. No lo vamos a volver a mostrar."
          items={[
            { label: "API key", value: client.publicKey },
            { label: "API secret", value: secret.value },
          ]}
          footnote={`El secret anterior sigue funcionando hasta el ${fmtDateTime(secret.until)}.`}
          onClose={() => setSecret(null)}
        />
      )}
    </article>
  );
}

function AccessTab({
  client,
  readOnly,
  busy,
  onRotate,
  onRotateFeed,
  onRevoke,
  onSaveAccess,
}: {
  client: ApiClientView;
  readOnly: boolean;
  busy: string | null;
  onRotate: () => void;
  onRotateFeed: () => void;
  onRevoke: () => void;
  onSaveAccess: (data: { name: string; scopes: CatalogApiScope[]; ipAllowlist: string[] }) => void;
}) {
  const [name, setName] = useState(client.name);
  const [scopes, setScopes] = useState<CatalogApiScope[]>(client.scopes);
  const [ipText, setIpText] = useState(client.ipAllowlist.join("\n"));
  const { ips, invalid } = useMemo(() => parseIpList(ipText), [ipText]);
  const dirty =
    name.trim() !== client.name ||
    scopes.slice().sort().join() !== client.scopes.slice().sort().join() ||
    ips.slice().sort().join() !== client.ipAllowlist.slice().sort().join();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-surface-500 mb-1">API key</p>
          <CopyField value={client.publicKey} label="key" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-surface-500 mb-1">API secret</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-surface-900 border border-surface-800 px-2.5 py-1.5 text-xs font-mono text-surface-400">
              nodo_sk_••••••••••••{client.secretLast4}
            </code>
            {!readOnly && (
              <button type="button" disabled={busy === "rotate"} onClick={onRotate} className={ghostBtn}>
                {busy === "rotate" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Rotar
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-surface-500">Solo se muestra al crearla o rotarla. Si lo perdiste, rotalo.</p>
        </div>

        <div className="rounded-lg border border-surface-800 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Rss className="w-3.5 h-3.5 text-brand-400" /> Feeds de producto
          </p>
          <p className="mt-1 text-[11px] text-surface-500">
            Pegá estos links en Google Merchant Center y en el Administrador de catálogos de Meta. No necesitan key: el link es privado.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <div>
              <p className="text-[11px] text-surface-400 mb-1">Google Merchant (XML)</p>
              <CopyField value={client.feeds.google} label="link" />
            </div>
            <div>
              <p className="text-[11px] text-surface-400 mb-1">Meta / Instagram (CSV)</p>
              <CopyField value={client.feeds.meta} label="link" />
            </div>
          </div>
          {!client.scopes.includes("feeds:read") && (
            <p className="mt-2 text-[11px] text-amber-300">Esta key no tiene el permiso de feeds: activalo para que los links funcionen.</p>
          )}
          {!client.config.feed.productUrlTemplate && (
            <p className="mt-1 text-[11px] text-amber-300">Falta el link de producto de tu tienda (en Configuración → Feeds).</p>
          )}
          {!readOnly && (
            <button type="button" disabled={busy === "feed"} onClick={onRotateFeed} className={`${ghostBtn} mt-3`}>
              Generar links nuevos
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Field label="Nombre">
          <input value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} aria-label="Nombre de la key" />
        </Field>
        <Field label="Permisos">
          <div className="flex flex-col gap-1.5">
            {CATALOG_API_SCOPES.map((s) => (
              <label key={s} className={`flex items-center gap-2 text-xs ${readOnly ? "" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  className="accent-brand-500"
                  disabled={readOnly}
                  checked={scopes.includes(s)}
                  onChange={() => setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))}
                />
                <span className="text-surface-100">{CATALOG_API_SCOPE_LABELS[s]}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="IPs permitidas" hint={invalid.length ? `No son IPs válidas: ${invalid.join(", ")}` : "Vacío = desde cualquier IP."}>
          <textarea
            value={ipText}
            disabled={readOnly}
            onChange={(e) => setIpText(e.target.value)}
            rows={3}
            className={`${inputClass} font-mono text-xs ${invalid.length ? "border-red-500/60" : ""}`}
            aria-label="IPs permitidas"
          />
        </Field>
        {!readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" disabled={busy === "revoke"} onClick={onRevoke} className={dangerBtn}>
              <ShieldAlert className="w-3.5 h-3.5" /> Revocar key
            </button>
            <button
              type="button"
              disabled={!dirty || !name.trim() || scopes.length === 0 || invalid.length > 0 || busy === "access"}
              onClick={() => onSaveAccess({ name: name.trim(), scopes, ipAllowlist: ips })}
              className={primaryBtn}
            >
              Guardar acceso
            </button>
          </div>
        )}
        <p className="text-[11px] text-surface-500">
          Creada el {fmtDateTime(client.createdAt)}
          {client.revokedAt ? ` · revocada el ${fmtDateTime(client.revokedAt)}` : ""}. <CopyButton text={client.id} label="id" className="ml-1" />
        </p>
      </div>
    </div>
  );
}
