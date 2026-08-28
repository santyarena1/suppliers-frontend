"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { TgsButton, TgsInput } from "@/components/tgs/TgsUi";
import { tgsErr } from "@/components/tgs/tgs-format";
import { tgsApi, type TgsKeysStatus } from "@/lib/tgs-api";

export default function TgsKeysForm({
  initial,
  onSaved,
}: {
  initial?: TgsKeysStatus | null;
  onSaved?: (status: TgsKeysStatus) => void;
}) {
  const [status, setStatus] = useState<TgsKeysStatus | null>(initial ?? null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setStatus(initial);
      setBaseUrl(initial.source === "db" ? initial.baseUrl : "");
      return;
    }
    tgsApi
      .keys()
      .then((res) => {
        setStatus(res.data);
        setBaseUrl(res.data.source === "db" ? res.data.baseUrl : "");
      })
      .catch((err) => setAviso(tgsErr(err, "No se pudo leer el estado de las claves")));
  }, [initial]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAviso(null);
    setOk(null);
    try {
      const res = await tgsApi.saveKeys({
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        baseUrl: baseUrl.trim() || undefined,
      });
      setStatus(res.data);
      setApiKey("");
      setApiSecret("");
      if (res.data.verified) {
        setOk(
          res.data.key_name
            ? `Conectado a ${res.data.tenant ?? "AcuStock"} · ${res.data.key_name}`
            : "Claves guardadas y verificadas"
        );
      } else {
        setAviso(res.data.verifyError || "Se guardaron, pero AcuStock no las aceptó.");
      }
      onSaved?.(res.data);
    } catch (err) {
      setAviso(tgsErr(err, "No se pudieron guardar las claves"));
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setAviso(null);
    setOk(null);
    try {
      const res = await tgsApi.clearKeys();
      setStatus(res.data);
      onSaved?.(res.data);
      setOk(res.data.configured ? "Se quitaron las claves de la base. Queda el fallback del servidor." : "Se quitaron las claves.");
    } catch (err) {
      setAviso(tgsErr(err, "No se pudieron quitar las claves"));
    } finally {
      setSaving(false);
    }
  }

  const sourceLabel =
    status?.source === "db" ? "Guardadas en Nodo" : status?.source === "env" ? "Desde el servidor" : "Sin cargar";

  return (
    <section className="border border-surface-800 rounded-xl p-4 sm:p-5 max-w-xl space-y-4">
      <div className="flex items-start gap-3">
        <KeyRound className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-white">Claves de AcuStock</h2>
          <p className="text-xs text-surface-500 mt-0.5 leading-relaxed">
            Headers <span className="font-mono text-surface-400">X-AcuStock-Key</span> y{" "}
            <span className="font-mono text-surface-400">X-AcuStock-Secret</span>. Se cifran en Nodo y no se vuelven a
            mostrar.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 ${
            status?.configured ? "bg-emerald-500/15 text-emerald-300" : "bg-surface-800 text-surface-400"
          }`}
        >
          {sourceLabel}
        </span>
        {status?.keyHint && <span className="font-mono text-surface-400">{status.keyHint}</span>}
      </div>

      {aviso && <p className="text-xs rounded-md px-3 py-2 bg-red-500/10 text-red-400">{aviso}</p>}
      {ok && <p className="text-xs rounded-md px-3 py-2 bg-emerald-500/10 text-emerald-300">{ok}</p>}

      <form onSubmit={save} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          API Key
          <div className="relative">
            <TgsInput
              type={show ? "text" : "password"}
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.keyHint ?? "Pegá la API key"}
              className="w-full pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white"
              aria-label={show ? "Ocultar" : "Mostrar"}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          API Secret
          <TgsInput
            type={show ? "text" : "password"}
            autoComplete="off"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder={status?.secretConfigured ? "••••••••" : "Pegá el API secret"}
            className="w-full"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-surface-400">
          URL base (opcional)
          <TgsInput
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={status?.baseUrl}
            className="w-full"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <TgsButton type="submit" disabled={saving || apiKey.trim().length < 12 || apiSecret.trim().length < 12}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Guardar y probar
          </TgsButton>
          {status?.source === "db" && (
            <TgsButton type="button" tone="ghost" disabled={saving} onClick={clear}>
              Quitar
            </TgsButton>
          )}
        </div>
      </form>
    </section>
  );
}
