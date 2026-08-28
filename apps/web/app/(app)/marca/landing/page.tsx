"use client";

import { useCallback, useEffect, useState } from "react";
import PrefsPanel from "@/components/PrefsPanel";
import { brandApi, type BrandLanding } from "@/lib/api";
import { Copy, Globe, Loader2 } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

const inputClass =
  "w-full bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500";

export default function BrandLandingPage() {
  const [landing, setLanding] = useState<BrandLanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [blockTitle, setBlockTitle] = useState("");
  const [blockBody, setBlockBody] = useState("");

  const load = useCallback(async () => {
    const res = await brandApi.landing();
    setLanding(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setAviso({ ok: false, text: errMsg(err, "No se pudo cargar la landing") });
      setLoading(false);
    });
  }, [load]);

  const blocks = Array.isArray(landing?.blocks) ? (landing.blocks as { title?: string; body?: string }[]) : [];

  async function save(patch: Partial<BrandLanding>) {
    if (!landing) return;
    setSaving(true);
    try {
      const res = await brandApi.saveLanding(patch);
      setLanding(res.data);
      setAviso({ ok: true, text: "Landing guardada" });
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo guardar") });
    } finally {
      setSaving(false);
    }
  }

  function addBlock() {
    if (!blockTitle.trim() && !blockBody.trim()) return;
    const next = [...blocks, { type: "text", title: blockTitle.trim(), body: blockBody.trim() }];
    setBlockTitle("");
    setBlockBody("");
    void save({ blocks: next });
  }

  function removeBlock(index: number) {
    void save({ blocks: blocks.filter((_, i) => i !== index) });
  }

  async function copyUrl() {
    if (!landing) return;
    const url = `${window.location.origin}${landing.publicPath}`;
    await navigator.clipboard.writeText(url);
    setAviso({ ok: true, text: "Link copiado" });
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Landing pública</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Marketing de la marca. No muestra catálogo ni precios. La URL usa una clave opaca.
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
          {loading || !landing ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <>
              <div className="border border-surface-800 rounded-xl p-4 bg-surface-900 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-surface-500">Dirección pública</p>
                  <p className="text-sm text-white truncate font-mono">{landing.publicPath}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={copyUrl} className="text-xs text-surface-300 border border-surface-700 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1">
                    <Copy className="w-3 h-3" /> Copiar
                  </button>
                  {landing.published && (
                    <a href={landing.publicPath} target="_blank" rel="noreferrer" className="text-xs text-brand-400 border border-brand-500/30 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Ver
                    </a>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-surface-200">
                <input
                  type="checkbox"
                  checked={landing.published}
                  onChange={(e) => save({ published: e.target.checked })}
                />
                Publicada
              </label>

              <Field label="Titular">
                <input className={inputClass} value={landing.headline ?? ""} onChange={(e) => setLanding({ ...landing, headline: e.target.value })} onBlur={() => save({ headline: landing.headline })} />
              </Field>
              <Field label="Quiénes somos">
                <textarea className={`${inputClass} min-h-[120px]`} value={landing.about ?? ""} onChange={(e) => setLanding({ ...landing, about: e.target.value })} onBlur={() => save({ about: landing.about })} />
              </Field>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Logo (URL)">
                  <input className={inputClass} value={landing.logoUrl ?? ""} onChange={(e) => setLanding({ ...landing, logoUrl: e.target.value })} onBlur={() => save({ logoUrl: landing.logoUrl })} />
                </Field>
                <Field label="Imagen de portada (URL)">
                  <input className={inputClass} value={landing.heroUrl ?? ""} onChange={(e) => setLanding({ ...landing, heroUrl: e.target.value })} onBlur={() => save({ heroUrl: landing.heroUrl })} />
                </Field>
                <Field label="Sitio web">
                  <input className={inputClass} value={landing.websiteUrl ?? ""} onChange={(e) => setLanding({ ...landing, websiteUrl: e.target.value })} onBlur={() => save({ websiteUrl: landing.websiteUrl })} />
                </Field>
                <Field label="Email de contacto">
                  <input className={inputClass} value={landing.supportEmail ?? ""} onChange={(e) => setLanding({ ...landing, supportEmail: e.target.value })} onBlur={() => save({ supportEmail: landing.supportEmail })} />
                </Field>
                <Field label="Teléfono">
                  <input className={inputClass} value={landing.supportPhone ?? ""} onChange={(e) => setLanding({ ...landing, supportPhone: e.target.value })} onBlur={() => save({ supportPhone: landing.supportPhone })} />
                </Field>
              </div>

              <section>
                <h2 className="text-sm font-semibold text-white mb-2">Bloques extra</h2>
                <div className="flex flex-col gap-2 mb-3">
                  {blocks.map((block, i) => (
                    <div key={i} className="border border-surface-800 rounded-lg px-3 py-2">
                      <div className="flex justify-between gap-2">
                        <p className="text-sm text-white">{block.title || "Bloque"}</p>
                        <button onClick={() => removeBlock(i)} className="text-[11px] text-red-400">Quitar</button>
                      </div>
                      {block.body && <p className="text-xs text-surface-400 mt-1">{block.body}</p>}
                    </div>
                  ))}
                </div>
                <div className="grid gap-2">
                  <input className={inputClass} placeholder="Título del bloque" value={blockTitle} onChange={(e) => setBlockTitle(e.target.value)} />
                  <textarea className={`${inputClass} min-h-[64px]`} placeholder="Texto" value={blockBody} onChange={(e) => setBlockBody(e.target.value)} />
                  <button onClick={addBlock} disabled={saving} className="self-start text-xs font-semibold bg-surface-800 hover:bg-surface-700 text-white rounded-lg px-3 py-2">
                    Agregar bloque
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-surface-400 mb-1">{label}</span>
      {children}
    </label>
  );
}
