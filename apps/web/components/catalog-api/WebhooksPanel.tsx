"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, Plus, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import { catalogApiAdmin } from "@/lib/api";
import {
  CATALOG_API_WEBHOOK_EVENTS,
  CATALOG_API_WEBHOOK_EVENT_LABELS,
  type CatalogApiWebhookEvent,
  type DeliveryView,
  type WebhookView,
} from "@/lib/catalog-api";
import { Field, SecretReveal, StatusPill, apiMessage, dangerBtn, fmtAgo, fmtDateTime, fmtIn, ghostBtn, inputClass, primaryBtn } from "./ui";

const DEFAULT_EVENTS: CatalogApiWebhookEvent[] = ["offer.created", "offer.updated", "offer.removed"];

function validUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return "Tiene que empezar con https://";
    return null;
  } catch {
    return "No es una URL válida";
  }
}

/** Webhooks de una key: alta, estado, pruebas y últimas entregas. */
export default function WebhooksPanel({
  clientId,
  readOnly,
  onMessage,
}: {
  clientId: string;
  readOnly: boolean;
  onMessage: (ok: boolean, text: string) => void;
}) {
  const [hooks, setHooks] = useState<WebhookView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<CatalogApiWebhookEvent[]>(DEFAULT_EVENTS);
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ title: string; value: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await catalogApiAdmin.webhooks(clientId);
      setHooks(res.data.webhooks ?? []);
      setError(null);
    } catch (err) {
      setError(apiMessage(err, "No se pudieron cargar los webhooks"));
    }
  }, [clientId]);

  useEffect(() => {
    setHooks(null);
    void load();
  }, [load]);

  const urlError = url ? validUrl(url) : null;

  async function create() {
    if (!url || urlError || events.length === 0) return;
    setBusy("create");
    try {
      const res = await catalogApiAdmin.createWebhook(clientId, { url, events });
      setHooks((prev) => [res.data.webhook, ...(prev ?? [])]);
      setSecret({ title: "Webhook creado", value: res.data.signingSecret });
      setAdding(false);
      setUrl("");
      setEvents(DEFAULT_EVENTS);
    } catch (err) {
      onMessage(false, apiMessage(err, "No se pudo crear el webhook"));
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, action: () => Promise<unknown>, ok: string, fallback: string) {
    setBusy(id);
    try {
      await action();
      onMessage(true, ok);
      await load();
    } catch (err) {
      onMessage(false, apiMessage(err, fallback));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-surface-400 leading-relaxed max-w-xl">
          NODO le avisa a tu sistema cuando entra, sale o cambia un producto, firmado con un secret para que verifiques que somos
          nosotros. Se reintenta hasta 7 veces durante 2 días si tu servidor no responde.
        </p>
        {!readOnly && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${primaryBtn} flex-shrink-0`}>
            <Plus className="w-3.5 h-3.5" /> Agregar
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-surface-800 bg-surface-900 p-3 flex flex-col gap-3">
          <Field label="URL de tu servidor" hint={urlError ?? "Tiene que responder 2xx en menos de 10 segundos."}>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value.trim())}
              placeholder="https://mitienda.com.ar/webhooks/nodo"
              className={`${inputClass} font-mono text-xs ${urlError ? "border-red-500/60" : ""}`}
              aria-label="URL del webhook"
              autoFocus
            />
          </Field>
          <Field label="Eventos">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CATALOG_API_WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-start gap-2 rounded-md border border-surface-800 px-2.5 py-2 cursor-pointer hover:border-surface-600">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-brand-500"
                    checked={events.includes(ev)}
                    onChange={() => setEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]))}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs text-surface-100">{CATALOG_API_WEBHOOK_EVENT_LABELS[ev]}</span>
                    <code className="text-[10px] text-surface-500">{ev}</code>
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className={ghostBtn}>
              Cancelar
            </button>
            <button type="button" disabled={!url || !!urlError || events.length === 0 || busy === "create"} onClick={() => void create()} className={primaryBtn}>
              {busy === "create" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Crear webhook
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      {!hooks && !error && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
        </div>
      )}
      {hooks && hooks.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-surface-700 px-4 py-6 text-center">
          <Webhook className="mx-auto w-5 h-5 text-surface-600" />
          <p className="mt-2 text-xs text-surface-400">Sin webhooks. Sin ellos podés consultar /v1/changes cada tanto.</p>
        </div>
      )}

      {hooks?.map((h) => {
        const disabled = !!h.disabledAt;
        return (
          <div key={h.id} className="rounded-lg border border-surface-800">
            <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {disabled ? (
                    <StatusPill tone="bad">Deshabilitado</StatusPill>
                  ) : h.active ? (
                    <StatusPill tone="ok">Activo</StatusPill>
                  ) : (
                    <StatusPill tone="muted">Pausado</StatusPill>
                  )}
                  {h.consecutiveFailures > 0 && !disabled && <StatusPill tone="warn">{h.consecutiveFailures} fallos seguidos</StatusPill>}
                  <code className="truncate text-xs text-surface-200">{h.url}</code>
                </div>
                <p className="mt-1 text-[11px] text-surface-500">
                  {h.events.length} {h.events.length === 1 ? "evento" : "eventos"} · última entrega{" "}
                  {h.lastDelivery ? `${fmtAgo(h.lastDelivery.createdAt)} (${h.lastDelivery.lastStatusCode ?? h.lastDelivery.status})` : "nunca"}
                </p>
                {disabled && h.disabledReason && <p className="mt-1 text-[11px] text-red-300">{h.disabledReason}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!readOnly && (
                  <>
                    {disabled || !h.active ? (
                      <button type="button" disabled={busy === h.id} onClick={() => void act(h.id, () => catalogApiAdmin.updateWebhook(h.id, { active: true }), "Webhook reactivado", "No se pudo reactivar")} className={ghostBtn}>
                        Reactivar
                      </button>
                    ) : (
                      <button type="button" disabled={busy === h.id} onClick={() => void act(h.id, () => catalogApiAdmin.updateWebhook(h.id, { active: false }), "Webhook pausado", "No se pudo pausar")} className={ghostBtn}>
                        Pausar
                      </button>
                    )}
                    <button type="button" disabled={busy === h.id} onClick={() => void act(h.id, () => catalogApiAdmin.testWebhook(h.id), "Mandamos un evento de prueba (ping)", "No se pudo mandar la prueba")} className={ghostBtn}>
                      <Send className="w-3.5 h-3.5" /> Probar
                    </button>
                    <button
                      type="button"
                      disabled={busy === h.id}
                      onClick={async () => {
                        if (!window.confirm("¿Generar un secret nuevo? El anterior deja de servir para verificar la firma.")) return;
                        setBusy(h.id);
                        try {
                          const res = await catalogApiAdmin.rotateWebhookSecret(h.id);
                          setSecret({ title: "Secret de firma nuevo", value: res.data.signingSecret });
                          await load();
                        } catch (err) {
                          onMessage(false, apiMessage(err, "No se pudo rotar el secret"));
                        } finally {
                          setBusy(null);
                        }
                      }}
                      className={ghostBtn}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Secret
                    </button>
                    <button
                      type="button"
                      disabled={busy === h.id}
                      onClick={() => {
                        if (!window.confirm("¿Borrar este webhook? Deja de recibir avisos.")) return;
                        void act(h.id, () => catalogApiAdmin.deleteWebhook(h.id), "Webhook borrado", "No se pudo borrar");
                      }}
                      className={dangerBtn}
                      aria-label="Borrar webhook"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setOpen((v) => (v === h.id ? null : h.id))} className={ghostBtn} aria-expanded={open === h.id}>
                  Entregas <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open === h.id ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>
            {open === h.id && <Deliveries webhookId={h.id} />}
          </div>
        );
      })}

      {secret && (
        <SecretReveal
          title={secret.title}
          lead="Este es el secret para verificar la firma (header Nodo-Signature). No lo vamos a volver a mostrar."
          items={[{ label: "Signing secret", value: secret.value }]}
          footnote="En la documentación tenés cómo verificar la firma en Node, Python y PHP."
          onClose={() => setSecret(null)}
        />
      )}
    </div>
  );
}

function Deliveries({ webhookId }: { webhookId: string }) {
  const [rows, setRows] = useState<DeliveryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    catalogApiAdmin
      .deliveries(webhookId, 50)
      .then((res) => alive && setRows(res.data.deliveries ?? []))
      .catch((err) => alive && setError(apiMessage(err, "No se pudieron cargar las entregas")));
    return () => {
      alive = false;
    };
  }, [webhookId]);

  if (error) return <p className="border-t border-surface-800 px-3 py-3 text-xs text-red-400">{error}</p>;
  if (!rows) {
    return (
      <div className="flex justify-center border-t border-surface-800 py-4">
        <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
      </div>
    );
  }
  if (rows.length === 0) return <p className="border-t border-surface-800 px-3 py-3 text-xs text-surface-500">Todavía no hubo entregas.</p>;
  return (
    <div className="overflow-x-auto border-t border-surface-800">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="text-[11px] text-surface-500">
          <tr>
            <th className="px-3 py-2 font-medium">Cuándo</th>
            <th className="px-3 py-2 font-medium">Evento</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium text-right">Intentos</th>
            <th className="px-3 py-2 font-medium">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-t border-surface-800/70">
              <td className="px-3 py-2 tabular-nums text-surface-300 whitespace-nowrap">{fmtDateTime(d.createdAt)}</td>
              <td className="px-3 py-2">
                <code className="text-surface-200">{d.type}</code>
              </td>
              <td className="px-3 py-2">
                {d.status === "DELIVERED" ? (
                  <StatusPill tone="ok">{d.lastStatusCode ?? 200}</StatusPill>
                ) : d.status === "PENDING" ? (
                  <StatusPill tone="warn">Reintenta {fmtIn(d.nextAttemptAt)}</StatusPill>
                ) : (
                  <StatusPill tone="bad">{d.lastStatusCode ?? "Falló"}</StatusPill>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-surface-300">{d.attempts}</td>
              <td className="px-3 py-2 max-w-[240px] truncate text-surface-500" title={d.lastError ?? ""}>
                {d.lastError ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
