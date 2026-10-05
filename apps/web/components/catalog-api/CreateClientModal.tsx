"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { catalogApiAdmin } from "@/lib/api";
import { CATALOG_API_SCOPES, CATALOG_API_SCOPE_LABELS, type ApiClientView, type CatalogApiScope } from "@/lib/catalog-api";
import { Field, Modal, apiMessage, ghostBtn, inputClass, primaryBtn } from "./ui";

const PRESETS: { key: string; label: string; hint: string; scopes: CatalogApiScope[] }[] = [
  { key: "store", label: "Tienda online", hint: "Lee el catálogo y recibe cambios.", scopes: ["catalog:read", "changes:read", "webhooks:manage"] },
  { key: "erp", label: "ERP / sistema interno", hint: "Todo, incluido exportar.", scopes: [...CATALOG_API_SCOPES] },
  { key: "feeds", label: "Google / Meta", hint: "Solo los feeds de producto.", scopes: ["feeds:read"] },
];

/** Parsea IPs o rangos CIDR (IPv4/IPv6), una por línea o separadas por coma. */
export function parseIpList(text: string): { ips: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/(3[0-2]|[12]?\d))?$/;
  const ipv6 = /^[0-9a-f:]+(\/(12[0-8]|1[01]\d|\d?\d))?$/i;
  const ips: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) (ipv4.test(p) || (p.includes(":") && ipv6.test(p)) ? ips : invalid).push(p);
  return { ips: [...new Set(ips)], invalid };
}

export default function CreateClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (client: ApiClientView, secret: string) => void;
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<CatalogApiScope[]>(PRESETS[0].scopes);
  const [ipText, setIpText] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ips, invalid } = parseIpList(ipText);

  async function submit() {
    if (!name.trim() || scopes.length === 0 || invalid.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await catalogApiAdmin.createClient({
        name: name.trim(),
        scopes,
        ipAllowlist: ips,
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      });
      onCreated(res.data.client, res.data.secret);
    } catch (err) {
      setError(apiMessage(err, "No se pudo crear la key"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Nueva API key" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Nombre" hint="Para reconocerla: dónde la vas a usar.">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} placeholder="Tienda online" autoFocus aria-label="Nombre de la key" />
        </Field>

        <Field label="Para qué es">
          <div className="grid gap-1.5 sm:grid-cols-3">
            {PRESETS.map((p) => {
              const on = p.scopes.length === scopes.length && p.scopes.every((s) => scopes.includes(s));
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setScopes(p.scopes)}
                  aria-pressed={on}
                  className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${on ? "border-brand-500 bg-brand-500/10" : "border-surface-700 hover:border-surface-500"}`}
                >
                  <span className="block text-xs font-semibold text-white">{p.label}</span>
                  <span className="block text-[11px] text-surface-400 mt-0.5">{p.hint}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Permisos">
          <div className="flex flex-col gap-1.5">
            {CATALOG_API_SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-brand-500"
                  checked={scopes.includes(s)}
                  onChange={() => setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))}
                />
                <span className="text-surface-100">{CATALOG_API_SCOPE_LABELS[s]}</span>
                <code className="text-[10px] text-surface-500">{s}</code>
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="IPs permitidas (opcional)"
          hint={invalid.length ? `No son IPs válidas: ${invalid.join(", ")}` : "Vacío = desde cualquier IP. Una por línea; acepta rangos como 200.45.10.0/24."}
        >
          <textarea
            value={ipText}
            onChange={(e) => setIpText(e.target.value)}
            rows={2}
            className={`${inputClass} font-mono text-xs ${invalid.length ? "border-red-500/60" : ""}`}
            placeholder="181.30.20.15"
            aria-label="IPs permitidas"
          />
        </Field>

        <Field label="Vence (opcional)" hint="Útil para keys de prueba o de un proveedor externo.">
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} min={new Date().toISOString().slice(0, 10)} className={`${inputClass} max-w-[180px]`} aria-label="Fecha de vencimiento" />
        </Field>

        {error && <p className="text-xs text-red-400">{error}</p>}
        <p className="text-[11px] text-surface-500">
          La key arranca con la configuración recomendada (precio con margen, distribuidor oculto, sin productos sin stock). La ajustás después.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ghostBtn}>
            Cancelar
          </button>
          <button type="button" disabled={busy || !name.trim() || scopes.length === 0 || invalid.length > 0} onClick={() => void submit()} className={primaryBtn}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Crear key
          </button>
        </div>
      </div>
    </Modal>
  );
}
