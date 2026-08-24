"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Pencil, Trash2, XCircle } from "lucide-react";
import { credentialsApi, type Provider } from "@/lib/api";
import { getTenant } from "@/lib/auth";
import { canManageCommerce } from "@/lib/commerce";
import {
  PROVIDER_CREDENTIAL_SCHEMAS,
  emptyValues,
  hasElitPortalLogin,
  hasNewBytesPortalLogin,
  toSavePayload,
  validateCredentialValues,
  valuesFromSaved,
} from "@/lib/credentialFields";
import NodoSpinner from "./NodoSpinner";

export default function ProviderCredentialForm({
  provider,
  onChanged,
}: {
  provider: Provider;
  onChanged?: () => void;
}) {
  const schema = PROVIDER_CREDENTIAL_SCHEMAS[provider];
  const [values, setValues] = useState<Record<string, string>>(schema ? emptyValues(schema) : {});
  const [genericFields, setGenericFields] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasCred, setHasCred] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // La sesión vive en el navegador, así que recién está disponible después de montar.
  const [tenant, setTenant] = useState<{ name: string } | null>(null);
  const [manage, setManage] = useState(false);

  useEffect(() => {
    setTenant(getTenant());
    setManage(canManageCommerce());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setResult(null);
      const currentSchema = PROVIDER_CREDENTIAL_SCHEMAS[provider];
      try {
        const res = await credentialsApi.getByProvider(provider);
        if (cancelled) return;
        const parsed =
          typeof res.data.credentialsJson === "string"
            ? (JSON.parse(res.data.credentialsJson) as Record<string, string>)
            : (res.data.credentialsJson as Record<string, string>);
        if (currentSchema) {
          setValues(valuesFromSaved(currentSchema, parsed));
        } else {
          const entries = Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) }));
          setGenericFields(entries.length > 0 ? entries : [{ key: "", value: "" }]);
        }
        setHasCred(true);
      } catch {
        if (cancelled) return;
        if (currentSchema) setValues(emptyValues(currentSchema));
        else setGenericFields([{ key: "", value: "" }]);
        setHasCred(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const creds = schema
        ? toSavePayload(schema, values)
        : Object.fromEntries(genericFields.filter(({ key }) => key.trim()).map(({ key, value }) => [key.trim(), value]));
      const error = validateCredentialValues(provider, schema ? values : creds);
      if (error) {
        setResult({ ok: false, msg: error });
        return;
      }
      await credentialsApi.save(provider, creds);
      setHasCred(true);
      setResult({ ok: true, msg: "Cuenta guardada. Ya podés sincronizar y, si aplica, ver pedidos." });
      onChanged?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setResult({ ok: false, msg: msg || "Error al guardar la cuenta" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const owner = tenant ? tenant.name : "tu organización";
    if (!window.confirm(`¿Eliminar la cuenta de ${provider.replace(/_/g, " ")} de ${owner}?`)) return;
    setDeleting(true);
    setResult(null);
    try {
      await credentialsApi.delete(provider);
      if (schema) setValues(emptyValues(schema));
      else setGenericFields([{ key: "", value: "" }]);
      setHasCred(false);
      setResult({ ok: true, msg: "Cuenta eliminada" });
      onChanged?.();
    } catch {
      setResult({ ok: false, msg: "Error al eliminar la cuenta" });
    } finally {
      setDeleting(false);
    }
  }

  const tokenOnlyNb =
    provider === "NEW_BYTES" && hasCred && !hasNewBytesPortalLogin(values) && Boolean((values.token ?? "").trim());
  const catalogOnlyElit =
    provider === "ELIT" &&
    hasCred &&
    !hasElitPortalLogin(values) &&
    Boolean((values.user_id ?? "").trim() || (values.token ?? "").trim());

  return (
    <div className="max-w-xl flex flex-col gap-4">
      <div className="border border-surface-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-600/15 flex items-center justify-center flex-shrink-0">
            <KeyRound className="w-4 h-4 text-brand-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">
              {schema?.title ?? `Credenciales de ${provider.replace(/_/g, " ")}`}
            </h2>
            <p className="text-xs text-surface-400 mt-1 leading-relaxed">
              {schema?.intro ??
                `Credenciales de acceso a la API de ${provider.replace(/_/g, " ")}. Se guardan cifradas y las comparte todo tu equipo.`}
            </p>
            {tenant && (
              <p className="text-xs text-surface-500 mt-2 leading-relaxed">
                Se guarda en <span className="text-surface-300">{tenant.name}</span>, así que la ve todo tu equipo.
              </p>
            )}
            {schema?.extra && <p className="text-xs text-surface-500 mt-2 leading-relaxed">{schema.extra}</p>}
            {schema?.portalUrl && (
              <a
                href={schema.portalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs text-brand-400 hover:text-brand-300 mt-2"
              >
                Abrir {schema.portalLabel ?? schema.portalUrl} ↗
              </a>
            )}
          </div>
        </div>

        {tokenOnlyNb && (
          <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs rounded-lg px-3.5 py-2.5">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            Con el token solo se sincroniza el catálogo CSV. Para pedidos y cuenta corriente cargá usuario y contraseña del portal.
          </div>
        )}
        {catalogOnlyElit && (
          <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs rounded-lg px-3.5 py-2.5">
            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            Con user ID y token solo se sincroniza el catálogo. Para pedidos y cuenta corriente cargá el nº de cliente y la contraseña del portal.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        ) : !manage ? (
          <p className="text-sm text-surface-300">
            {hasCred
              ? "Hay una cuenta cargada. La ve todo el equipo; solo el administrador la cambia."
              : "La cuenta la carga el administrador del local."}
          </p>
        ) : schema && schema.fields.length === 0 ? (
          <p className="text-xs text-surface-400">
            No hace falta cargar usuario: el catálogo se sincroniza desde la pestaña Sincronización.
          </p>
        ) : schema ? (
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            {schema.fields.map((field) => (
              <div key={field.key}>
                <label className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="text-xs font-medium text-surface-300">{field.label}</span>
                  {!field.required && <span className="text-[10px] text-surface-600">Opcional</span>}
                </label>
                <div className="relative">
                  <input
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    type={field.type === "password" && !show[field.key] ? "password" : "text"}
                    placeholder={field.placeholder}
                    autoComplete={field.autoComplete ?? "off"}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2.5 pr-9 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500"
                  />
                  {field.type === "password" && (
                    <button
                      type="button"
                      onClick={() => setShow((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                    >
                      {show[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {field.help && <p className="text-[11px] text-surface-500 mt-1">{field.help}</p>}
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
              >
                {saving ? <NodoSpinner className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                {hasCred ? "Actualizar cuenta" : "Guardar cuenta"}
              </button>
              {hasCred && (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex items-center justify-center gap-1.5 border border-red-500/25 text-red-400 hover:bg-red-500/10 disabled:opacity-40 text-sm font-medium rounded-lg px-4 transition-all"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          </form>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-surface-400">Campos</label>
              <button
                type="button"
                onClick={() => setGenericFields((prev) => [...prev, { key: "", value: "" }])}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                + Agregar campo
              </button>
            </div>
            {genericFields.map((field, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  placeholder="Clave"
                  value={field.key}
                  onChange={(e) =>
                    setGenericFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, key: e.target.value } : f)))
                  }
                  className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 font-mono"
                />
                <div className="relative flex-[1.5]">
                  <input
                    placeholder="Valor"
                    type={show[String(i)] ? "text" : "password"}
                    value={field.value}
                    onChange={(e) =>
                      setGenericFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, value: e.target.value } : f)))
                    }
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 pr-8 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => ({ ...v, [String(i)]: !v[String(i)] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                  >
                    {show[String(i)] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {genericFields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setGenericFields((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-surface-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all"
              >
                {saving ? <NodoSpinner className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                {hasCred ? "Actualizar" : "Guardar"}
              </button>
              {hasCred && (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex items-center justify-center gap-1.5 border border-red-500/25 text-red-400 hover:bg-red-500/10 disabled:opacity-40 text-sm font-medium rounded-lg px-4 transition-all"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          </form>
        )}

        {result && (
          <div
            className={`flex items-center gap-2 text-xs rounded-lg px-3.5 py-2.5 ${
              result.ok
                ? "bg-emerald-500/8 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                : "bg-red-500/8 border border-red-500/20 text-red-400"
            }`}
          >
            {result.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
            {result.msg}
          </div>
        )}
      </div>
    </div>
  );
}
