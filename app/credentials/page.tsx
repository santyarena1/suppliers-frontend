"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import AuthGuard from "@/components/AuthGuard";
import { credentialsApi, ALL_PROVIDERS, CredentialResponse, Provider } from "@/lib/api";
import { Plus, Trash2, Eye, EyeOff, Loader2, Key, ChevronDown } from "lucide-react";

type CredentialMap = Record<string, CredentialResponse>;

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<CredentialMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider>("INVID");
  const [credFields, setCredFields] = useState<{ key: string; value: string }[]>([
    { key: "", value: "" },
  ]);
  const [showValues, setShowValues] = useState<Record<number, boolean>>({});

  useEffect(() => { loadCredentials(); }, []);

  async function loadCredentials() {
    setLoading(true);
    try {
      const res = await credentialsApi.mine();
      const map: CredentialMap = {};
      res.data.forEach((c) => { map[c.providerName] = c; });
      setCredentials(map);
    } catch {
      setError("Error al cargar credenciales");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const creds: Record<string, string> = {};
      credFields.forEach(({ key, value }) => { if (key.trim()) creds[key.trim()] = value; });
      await credentialsApi.save(selectedProvider, creds);
      setSuccess(`Credencial de ${selectedProvider} guardada`);
      setShowModal(false);
      setCredFields([{ key: "", value: "" }]);
      await loadCredentials();
    } catch {
      setError("Error al guardar credencial");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(providerName: Provider) {
    if (!confirm(`¿Eliminar credencial de ${providerName}?`)) return;
    setDeleting(providerName);
    try {
      await credentialsApi.delete(providerName);
      setSuccess(`Credencial de ${providerName} eliminada`);
      await loadCredentials();
    } catch {
      setError("Error al eliminar credencial");
    } finally {
      setDeleting(null);
    }
  }

  function addField() { setCredFields((prev) => [...prev, { key: "", value: "" }]); }
  function removeField(i: number) { setCredFields((prev) => prev.filter((_, idx) => idx !== i)); }
  function updateField(i: number, field: "key" | "value", val: string) {
    setCredFields((prev) => prev.map((f, idx) => idx === i ? { ...f, [field]: val } : f));
  }

  function openEditModal(provider: Provider) {
    setSelectedProvider(provider);
    const existing = credentials[provider];
    if (existing) {
      try {
        const parsed = typeof existing.credentialsJson === "string"
          ? JSON.parse(existing.credentialsJson)
          : existing.credentialsJson;
        setCredFields(Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) })));
      } catch {
        setCredFields([{ key: "", value: "" }]);
      }
    } else {
      setCredFields([{ key: "", value: "" }]);
    }
    setShowModal(true);
  }

  const configured = ALL_PROVIDERS.filter((p) => credentials[p]);
  const unconfigured = ALL_PROVIDERS.filter((p) => !credentials[p]);

  return (
    <AuthGuard>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">Credenciales</h1>
              <p className="text-gray-400 text-sm">
                {configured.length} de {ALL_PROVIDERS.length} proveedores configurados
              </p>
            </div>
            <button
              onClick={() => { setSelectedProvider("INVID"); setCredFields([{ key: "", value: "" }]); setShowModal(true); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-4 py-2 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Nueva credencial
            </button>
          </div>

          {(error || success) && (
            <div className={`rounded-xl px-4 py-3 mb-6 text-sm border ${
              error
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-green-500/10 border-green-500/30 text-green-400"
            }`}>
              {error || success}
              <button onClick={() => { setError(""); setSuccess(""); }} className="ml-2 opacity-50 hover:opacity-100">✕</button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Configured */}
              {configured.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Configurados ({configured.length})
                  </h2>
                  <div className="flex flex-col gap-2">
                    {configured.map((provider) => {
                      const cred = credentials[provider];
                      let parsed: Record<string, string> = {};
                      try {
                        parsed = typeof cred.credentialsJson === "string"
                          ? JSON.parse(cred.credentialsJson)
                          : cred.credentialsJson;
                      } catch { /* ignore */ }
                      return (
                        <div
                          key={provider}
                          className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Key className="w-4 h-4 text-green-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-white font-medium text-sm">{provider}</p>
                              <p className="text-gray-500 text-xs truncate">
                                {Object.keys(parsed).join(", ")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => openEditModal(provider)}
                              className="text-xs text-blue-400 hover:text-blue-300 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(provider)}
                              disabled={deleting === provider}
                              className="text-red-400 hover:text-red-300 border border-gray-700 hover:border-red-500/30 rounded-lg p-1.5 transition-colors"
                            >
                              {deleting === provider
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Trash2 className="w-4 h-4" />}
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
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Sin configurar ({unconfigured.length})
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {unconfigured.map((provider) => (
                      <button
                        key={provider}
                        onClick={() => openEditModal(provider)}
                        className="flex items-center gap-2 bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-3 text-left transition-colors group"
                      >
                        <div className="w-7 h-7 bg-gray-800 group-hover:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Plus className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300" />
                        </div>
                        <span className="text-gray-500 group-hover:text-gray-300 text-xs font-medium">
                          {provider.replace(/_/g, " ")}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Credencial — {selectedProvider}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-gray-400">Proveedor</label>
                <div className="relative">
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value as Provider)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white appearance-none focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    {ALL_PROVIDERS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-400">Campos</label>
                  <button type="button" onClick={addField} className="text-xs text-blue-400 hover:text-blue-300">
                    + Agregar campo
                  </button>
                </div>
                {credFields.map((field, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      placeholder="Clave (ej: apiKey)"
                      value={field.key}
                      onChange={(e) => updateField(i, "key", e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500"
                    />
                    <div className="relative flex-1">
                      <input
                        placeholder="Valor"
                        type={showValues[i] ? "text" : "password"}
                        value={field.value}
                        onChange={(e) => updateField(i, "value", e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowValues((v) => ({ ...v, [i]: !v[i] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      >
                        {showValues[i] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {credFields.length > 1 && (
                      <button type="button" onClick={() => removeField(i)} className="text-gray-600 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-700 text-gray-400 hover:text-white rounded-lg py-2.5 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
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
