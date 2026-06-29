"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import { credentialsApi, ALL_PROVIDERS, CredentialResponse, Provider } from "@/lib/api";
import { Plus, Trash2, Eye, EyeOff, Loader2, CheckCircle2, XCircle, Pencil, ChevronDown } from "lucide-react";

type CredentialMap = Record<string, CredentialResponse>;

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<CredentialMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider>("INVID");
  const [credFields, setCredFields] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [showValues, setShowValues] = useState<Record<number, boolean>>({});

  useEffect(() => { loadCredentials(); }, []);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function loadCredentials() {
    setLoading(true);
    try {
      const res = await credentialsApi.mine();
      const map: CredentialMap = {};
      res.data.forEach((c) => { map[c.providerName] = c; });
      setCredentials(map);
    } catch {
      showToast("Error al cargar credenciales", false);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const creds: Record<string, string> = {};
      credFields.forEach(({ key, value }) => { if (key.trim()) creds[key.trim()] = value; });
      await credentialsApi.save(selectedProvider, creds);
      showToast(`Credencial de ${selectedProvider} guardada`);
      setShowModal(false);
      await loadCredentials();
    } catch {
      showToast("Error al guardar", false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(providerName: Provider) {
    if (!confirm(`¿Eliminar credencial de ${providerName}?`)) return;
    setDeleting(providerName);
    try {
      await credentialsApi.delete(providerName);
      showToast(`${providerName} eliminado`);
      await loadCredentials();
    } catch {
      showToast("Error al eliminar", false);
    } finally {
      setDeleting(null);
    }
  }

  function openModal(provider: Provider) {
    setSelectedProvider(provider);
    const existing = credentials[provider];
    if (existing) {
      try {
        const parsed = typeof existing.credentialsJson === "string"
          ? JSON.parse(existing.credentialsJson)
          : existing.credentialsJson;
        setCredFields(Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) })));
      } catch { setCredFields([{ key: "", value: "" }]); }
    } else {
      setCredFields([{ key: "", value: "" }]);
    }
    setShowValues({});
    setShowModal(true);
  }

  const configured = ALL_PROVIDERS.filter((p) => credentials[p]);
  const unconfigured = ALL_PROVIDERS.filter((p) => !credentials[p]);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        <Navbar />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 pt-12 lg:pt-0">
          {/* Header */}
          <header className="flex-shrink-0 border-b border-surface-800 px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-white">Credenciales de proveedores</h1>
              <p className="text-xs text-surface-500 mt-0.5">
                {configured.length}/{ALL_PROVIDERS.length} proveedores configurados
              </p>
            </div>
            <button
              onClick={() => { setSelectedProvider("INVID"); setCredFields([{ key: "", value: "" }]); setShowModal(true); }}
              className="flex items-center gap-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg px-3.5 py-2 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva credencial
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading ? (
              <div className="flex items-center justify-center py-32">
                <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              </div>
            ) : (
              <div className="max-w-3xl flex flex-col gap-8">
                {/* Configured */}
                {configured.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-widest">
                        Configurados — {configured.length}
                      </h2>
                    </div>
                    <div className="border border-surface-800 rounded-xl overflow-hidden divide-y divide-surface-800">
                      {configured.map((provider) => {
                        const cred = credentials[provider];
                        let parsed: Record<string, string> = {};
                        try { parsed = typeof cred.credentialsJson === "string" ? JSON.parse(cred.credentialsJson) : cred.credentialsJson; } catch { /**/ }
                        return (
                          <div key={provider} className="flex items-center gap-4 px-4 py-3 bg-surface-950 hover:bg-surface-900 transition-colors">
                            <div className="flex-1 flex items-center gap-3 min-w-0">
                              <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-surface-100">{provider}</p>
                                <p className="text-xs text-surface-500 font-mono truncate">
                                  {Object.keys(parsed).map((k) => `${k}: •••`).join("  ·  ")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button onClick={() => openModal(provider)} className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-100 border border-surface-700 hover:border-surface-500 rounded-md px-2.5 py-1.5 transition-all">
                                <Pencil className="w-3 h-3" /> Editar
                              </button>
                              <button
                                onClick={() => handleDelete(provider)}
                                disabled={!!deleting}
                                className="p-1.5 text-surface-600 hover:text-red-400 border border-transparent hover:border-red-500/20 rounded-md transition-all"
                              >
                                {deleting === provider
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />
                                }
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Unconfigured */}
                {unconfigured.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <XCircle className="w-3.5 h-3.5 text-surface-600" />
                      <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-widest">
                        Sin configurar — {unconfigured.length}
                      </h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {unconfigured.map((provider) => (
                        <button
                          key={provider}
                          onClick={() => openModal(provider)}
                          className="flex items-center gap-2.5 border border-surface-800 hover:border-surface-600 rounded-lg px-3.5 py-2.5 text-left transition-all group"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-surface-700 group-hover:bg-surface-500 transition-colors flex-shrink-0" />
                          <span className="text-xs text-surface-500 group-hover:text-surface-300 font-medium transition-colors truncate">
                            {provider.replace(/_/g, " ")}
                          </span>
                          <Plus className="w-3 h-3 text-surface-700 group-hover:text-surface-400 ml-auto flex-shrink-0 transition-colors" />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl transition-all ${
          toast.ok
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            : "bg-red-500/10 border-red-500/20 text-red-300"
        }`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-900 border border-surface-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-surface-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                {credentials[selectedProvider] ? "Editar" : "Nueva"} credencial
              </h2>
              <button onClick={() => setShowModal(false)} className="text-surface-500 hover:text-surface-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 flex flex-col gap-5">
              {/* Provider selector */}
              <div>
                <label className="block text-xs font-medium text-surface-400 mb-1.5">Proveedor</label>
                <div className="relative">
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value as Provider)}
                    className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3.5 py-2.5 text-sm text-white appearance-none focus:outline-none focus:border-brand-500 transition-all"
                  >
                    {ALL_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500 pointer-events-none" />
                </div>
              </div>

              {/* Fields */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-surface-400">Campos</label>
                  <button type="button" onClick={() => setCredFields((prev) => [...prev, { key: "", value: "" }])} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                    + Agregar campo
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {credFields.map((field, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        placeholder="Clave"
                        value={field.key}
                        onChange={(e) => setCredFields((prev) => prev.map((f, idx) => idx === i ? { ...f, key: e.target.value } : f))}
                        className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 font-mono"
                      />
                      <div className="relative flex-[1.5]">
                        <input
                          placeholder="Valor"
                          type={showValues[i] ? "text" : "password"}
                          value={field.value}
                          onChange={(e) => setCredFields((prev) => prev.map((f, idx) => idx === i ? { ...f, value: e.target.value } : f))}
                          className="w-full bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 pr-8 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-brand-500 font-mono"
                        />
                        <button type="button" onClick={() => setShowValues((v) => ({ ...v, [i]: !v[i] }))} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                          {showValues[i] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {credFields.length > 1 && (
                        <button type="button" onClick={() => setCredFields((prev) => prev.filter((_, idx) => idx !== i))} className="text-surface-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-surface-700 text-surface-400 hover:text-white rounded-lg py-2 text-sm transition-all">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2 text-sm transition-all flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
