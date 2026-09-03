"use client";

import { useCallback, useEffect, useState } from "react";
import PrefsPanel from "@/components/PrefsPanel";
import ImageUploadField from "@/components/ImageUploadField";
import BrandHtmlCanvas, { BrandHtmlSlotHole } from "@/components/org/BrandHtmlCanvas";
import { BrandSpaceLanding } from "@/components/org/BrandSpaceLanding";
import { brandApi, newsApi, type BrandAction, type BrandLanding, type BrandResource, type BrandSkuSignal, type NewsCard } from "@/lib/api";
import { BRAND_LANDING_HTML_TEMPLATE } from "@/lib/brand-visuals";
import { Copy, Globe, Loader2 } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

const inputClass =
  "w-full bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500";

const SLOTS: { name: string; label: string }[] = [
  { name: "productos", label: "Mapa / semáforos" },
  { name: "semaforos", label: "Semáforos (alias)" },
  { name: "acciones", label: "Acciones" },
  { name: "materiales", label: "Materiales" },
  { name: "capacitaciones", label: "Capacitaciones" },
  { name: "hablar", label: "Hablar" },
  { name: "nombre", label: "Nombre" },
  { name: "logo", label: "Logo" },
  { name: "noticias", label: "Noticias" },
  { name: "novedades", label: "Novedades (alias)" },
];

const FONTS = [
  { value: "", label: "La de NODO" },
  { value: "Inter, system-ui, sans-serif", label: "Inter" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: '"Courier New", monospace', label: "Courier" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
];

export default function BrandEspacioPage() {
  const [landing, setLanding] = useState<BrandLanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [blockTitle, setBlockTitle] = useState("");
  const [blockBody, setBlockBody] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");

  const [preview, setPreview] = useState<{
    signals: BrandSkuSignal[];
    actions: BrandAction[];
    materials: BrandResource[];
    trainings: BrandResource[];
    news: NewsCard[];
  }>({ signals: [], actions: [], materials: [], trainings: [], news: [] });

  const load = useCallback(async () => {
    const [landingRes, signalsRes, actionsRes, resourcesRes, newsRes] = await Promise.all([
      brandApi.landing(),
      brandApi.signals().catch(() => ({ data: { signals: [] as BrandSkuSignal[] } })),
      brandApi.actions().catch(() => ({ data: { actions: [] as BrandAction[] } })),
      brandApi.resources().catch(() => ({ data: { resources: [] as BrandResource[] } })),
      newsApi.mine().catch(() => ({ data: { items: [] as NewsCard[] } })),
    ]);
    setLanding(landingRes.data);
    const resources = resourcesRes.data.resources ?? [];
    setPreview({
      signals: signalsRes.data.signals ?? [],
      actions: (actionsRes.data.actions ?? []).filter((a) => a.status === "ACTIVE"),
      materials: resources.filter((r) => r.kind === "MATERIAL"),
      trainings: resources.filter((r) => r.kind === "TRAINING"),
      news: (newsRes.data.items ?? []).filter((n) => n.status === "PUBLISHED"),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setAviso({ ok: false, text: errMsg(err, "No se pudo cargar el espacio") });
      setLoading(false);
    });
  }, [load]);

  useEffect(() => {
    const html = landing?.html ?? "";
    const t = window.setTimeout(() => setPreviewHtml(html), 350);
    return () => window.clearTimeout(t);
  }, [landing?.html]);

  const blocks = Array.isArray(landing?.blocks) ? (landing.blocks as { title?: string; body?: string }[]) : [];

  async function save(patch: Partial<BrandLanding>) {
    if (!landing) return;
    setSaving(true);
    try {
      const res = await brandApi.saveLanding(patch);
      setLanding(res.data);
      setAviso({ ok: true, text: "Espacio guardado" });
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

  function insertSlot(name: string) {
    if (!landing) return;
    const next = `${landing.html ?? ""}${landing.html ? "\n" : ""}{{${name}}}`;
    setLanding({ ...landing, html: next });
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
          <h1 className="text-base font-semibold text-white">Espacio</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            La landing ya arma productos, acciones, novedades, materiales, capacitaciones y contacto. El HTML propio es
            opcional: va como presentación, con huecos si querés meter los módulos adentro.
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
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
              <section className="border border-surface-800 rounded-xl p-4 bg-surface-900 flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-white">Identidad</h2>
                <Field label="Titular">
                  <input
                    className={inputClass}
                    value={landing.headline ?? ""}
                    onChange={(e) => setLanding({ ...landing, headline: e.target.value })}
                    onBlur={() => save({ headline: landing.headline })}
                  />
                </Field>
                <Field label="Quiénes somos">
                  <textarea
                    className={`${inputClass} min-h-[100px]`}
                    value={landing.about ?? ""}
                    onChange={(e) => setLanding({ ...landing, about: e.target.value })}
                    onBlur={() => save({ about: landing.about })}
                  />
                </Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  <ImageUploadField
                    label="Logo"
                    value={landing.logoUrl ?? ""}
                    onChange={(url) => setLanding({ ...landing, logoUrl: url })}
                    onCommit={(url) => void save({ logoUrl: url })}
                  />
                  <ImageUploadField
                    label="Portada"
                    value={landing.heroUrl ?? ""}
                    onChange={(url) => setLanding({ ...landing, heroUrl: url })}
                    onCommit={(url) => void save({ heroUrl: url })}
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <ColorField
                    label="Color principal"
                    value={landing.primaryColor ?? "#22c55e"}
                    onChange={(v) => setLanding({ ...landing, primaryColor: v })}
                    onCommit={(v) => void save({ primaryColor: v })}
                  />
                  <ColorField
                    label="Fondo"
                    value={landing.backgroundColor ?? "#0b1220"}
                    onChange={(v) => setLanding({ ...landing, backgroundColor: v })}
                    onCommit={(v) => void save({ backgroundColor: v })}
                  />
                  <ColorField
                    label="Texto"
                    value={landing.textColor ?? "#f8fafc"}
                    onChange={(v) => setLanding({ ...landing, textColor: v })}
                    onCommit={(v) => void save({ textColor: v })}
                  />
                </div>
                <Field label="Tipografía">
                  <select
                    className={inputClass}
                    value={landing.fontFamily ?? ""}
                    onChange={(e) => {
                      const fontFamily = e.target.value || null;
                      setLanding({ ...landing, fontFamily });
                      void save({ fontFamily });
                    }}
                  >
                    {FONTS.map((f) => (
                      <option key={f.label} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <div
                  className="rounded-xl p-4 border border-white/10"
                  style={{
                    background: landing.backgroundColor || undefined,
                    color: landing.textColor || undefined,
                    fontFamily: landing.fontFamily || undefined,
                  }}
                >
                  <p className="text-[11px] uppercase tracking-widest opacity-70">Vista previa</p>
                  <p className="text-lg font-bold mt-1" style={{ color: landing.primaryColor || undefined }}>
                    {landing.headline || landing.name}
                  </p>
                  <p className="text-sm opacity-80 mt-1">{landing.about || "Así se va a sentir el espacio in-app."}</p>
                </div>
              </section>

              <section className="border border-surface-800 rounded-xl p-4 bg-surface-900 flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-white">HTML propio</h2>
                <p className="text-[11px] text-surface-500">
                  Opcional. Sin HTML, Nodo arma la landing completa (hero con fotos, productos, acciones, novedades,
                  materiales, capacitaciones y contacto). Si pegás HTML, tu diseño va como presentación y los módulos
                  siguen abajo — o adentro, si usás los huecos. Sin scripts ni iframes.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SLOTS.map((slot) => (
                    <button
                      key={slot.name}
                      type="button"
                      onClick={() => insertSlot(slot.name)}
                      className="text-[11px] font-mono border border-surface-700 rounded-md px-2 py-1 text-surface-300 hover:text-white"
                      title={slot.label}
                    >
                      {`{{${slot.name}}}`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (!landing) return;
                      setLanding({ ...landing, html: BRAND_LANDING_HTML_TEMPLATE });
                      void save({ html: BRAND_LANDING_HTML_TEMPLATE });
                    }}
                    className="text-[11px] font-semibold border border-brand-500/40 text-brand-300 rounded-md px-2 py-1 hover:bg-brand-500/10"
                  >
                    Plantilla con todos los módulos
                  </button>
                </div>
                <textarea
                  className={`${inputClass} min-h-[360px] font-mono text-xs`}
                  placeholder={'<!doctype html>\n<html>\n<head>\n  <style>\n    body { background: #fff; color: #111; }\n    .hero { font-size: 42px; }\n  </style>\n</head>\n<body>\n  <section class="hero">{{nombre}}</section>\n  {{semaforos}}\n</body>\n</html>'}
                  value={landing.html ?? ""}
                  onChange={(e) => setLanding({ ...landing, html: e.target.value })}
                  onBlur={() => save({ html: landing.html })}
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save({ html: landing.html })}
                  className="self-start text-xs font-semibold bg-surface-800 hover:bg-surface-700 text-white rounded-lg px-3 py-2"
                >
                  Guardar HTML
                </button>
                {previewHtml.trim() ? (
                  <p className="text-[11px] text-surface-500">
                    El HTML se pinta en la landing completa, más abajo en esta página.
                  </p>
                ) : null}
              </section>

              <section className="border border-surface-800 rounded-xl p-4 bg-surface-900 flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-white">Contacto</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Sitio web">
                    <input
                      className={inputClass}
                      value={landing.websiteUrl ?? ""}
                      onChange={(e) => setLanding({ ...landing, websiteUrl: e.target.value })}
                      onBlur={() => save({ websiteUrl: landing.websiteUrl })}
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      className={inputClass}
                      value={landing.supportEmail ?? ""}
                      onChange={(e) => setLanding({ ...landing, supportEmail: e.target.value })}
                      onBlur={() => save({ supportEmail: landing.supportEmail })}
                    />
                  </Field>
                  <Field label="Teléfono">
                    <input
                      className={inputClass}
                      value={landing.supportPhone ?? ""}
                      onChange={(e) => setLanding({ ...landing, supportPhone: e.target.value })}
                      onBlur={() => save({ supportPhone: landing.supportPhone })}
                    />
                  </Field>
                </div>
              </section>

              <section>
                <h2 className="text-sm font-semibold text-white mb-2">Bloques extra</h2>
                <div className="flex flex-col gap-2 mb-3">
                  {blocks.map((block, i) => (
                    <div key={i} className="border border-surface-800 rounded-lg px-3 py-2">
                      <div className="flex justify-between gap-2">
                        <p className="text-sm text-white">{block.title || "Bloque"}</p>
                        <button onClick={() => removeBlock(i)} className="text-[11px] text-red-400">
                          Quitar
                        </button>
                      </div>
                      {block.body && <p className="text-xs text-surface-400 mt-1">{block.body}</p>}
                    </div>
                  ))}
                </div>
                <div className="grid gap-2">
                  <input className={inputClass} placeholder="Título del bloque" value={blockTitle} onChange={(e) => setBlockTitle(e.target.value)} />
                  <textarea className={`${inputClass} min-h-[64px]`} placeholder="Texto" value={blockBody} onChange={(e) => setBlockBody(e.target.value)} />
                  <button
                    onClick={addBlock}
                    disabled={saving}
                    className="self-start text-xs font-semibold bg-surface-800 hover:bg-surface-700 text-white rounded-lg px-3 py-2"
                  >
                    Agregar bloque
                  </button>
                </div>
              </section>

              <section className="border border-dashed border-surface-700 rounded-xl p-4 bg-surface-900/50 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Página pública (opcional)</h2>
                    <p className="text-[11px] text-surface-500 mt-0.5">
                      Marketing afuera de NODO. No es el producto: el trabajo real es el espacio in-app. La URL es opaca.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-surface-200">
                    <input
                      type="checkbox"
                      checked={landing.published}
                      onChange={(e) => save({ published: e.target.checked })}
                    />
                    Publicada
                  </label>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-white truncate font-mono">{landing.publicPath}</p>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={copyUrl}
                      className="text-xs text-surface-300 border border-surface-700 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copiar
                    </button>
                    {landing.published && (
                      <a
                        href={landing.publicPath}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand-400 border border-brand-500/30 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1"
                      >
                        <Globe className="w-3 h-3" /> Ver
                      </a>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
        {!loading && landing && (
          <section className="border-t border-surface-800">
            <p className="text-[11px] uppercase tracking-widest text-surface-500 px-4 sm:px-6 py-3">
              Así lo ven el comercio y el distro
            </p>
            <LandingEditorPreview landing={landing} preview={preview} html={previewHtml} />
          </section>
        )}
      </div>
    </>
  );
}

function LandingEditorPreview({
  landing,
  preview,
  html,
}: {
  landing: BrandLanding;
  preview: {
    signals: BrandSkuSignal[];
    actions: BrandAction[];
    materials: BrandResource[];
    trainings: BrandResource[];
    news: NewsCard[];
  };
  html: string;
}) {
  const news = preview.news.map((n) => ({
    id: n.id,
    publicKey: n.publicKey,
    title: n.title,
    excerpt: n.excerpt,
    kind: n.kind,
    coverUrl: n.coverUrl,
    isPublic: n.isPublic,
    publishedAt: n.publishedAt,
  }));
  return (
    <BrandSpaceLanding
      variant="hub"
      name={landing.name}
      accent={landing.primaryColor || "#22c55e"}
      theme={{
        logoUrl: landing.logoUrl,
        heroUrl: landing.heroUrl,
        headline: landing.headline,
        about: landing.about,
      }}
      contact={{
        websiteUrl: landing.websiteUrl,
        supportEmail: landing.supportEmail,
        supportPhone: landing.supportPhone,
      }}
      products={preview.signals}
      actions={preview.actions}
      news={news}
      materials={preview.materials}
      trainings={preview.trainings}
      extraBlocks={Array.isArray(landing.blocks) ? (landing.blocks as { title?: string; body?: string; url?: string }[]) : []}
      html={
        html.trim() ? (
          <BrandHtmlCanvas
            html={html}
            slots={{
              productos: <BrandHtmlSlotHole label="productos" />,
              semaforos: <BrandHtmlSlotHole label="productos" />,
              acciones: <BrandHtmlSlotHole label="acciones" />,
              materiales: <BrandHtmlSlotHole label="materiales" />,
              capacitaciones: <BrandHtmlSlotHole label="capacitaciones" />,
              hablar: <BrandHtmlSlotHole label="contacto" />,
              nombre: <span>{landing.name}</span>,
              logo: landing.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={landing.logoUrl} alt="" style={{ height: 48 }} />
              ) : (
                <BrandHtmlSlotHole label="contacto" />
              ),
              noticias: <BrandHtmlSlotHole label="novedades" />,
              novedades: <BrandHtmlSlotHole label="novedades" />,
            }}
          />
        ) : null
      }
    />
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

function ColorField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-surface-400 mb-1">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#22c55e"}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          className="h-9 w-9 rounded border border-surface-700 bg-transparent cursor-pointer"
        />
        <input
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
        />
      </span>
    </label>
  );
}
