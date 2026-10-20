"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ExternalLink, ImagePlus, Loader2, Lock, Trash2 } from "lucide-react";
import { buildQuotePdfModel } from "@/components/quotes/pdf/quote-pdf-model";
import { loadQuoteSettings, publishQuoteSettings } from "@/components/quotes/quote-share";
import { getTenant } from "@/lib/auth";
import { proxyImg } from "@/lib/format";
import { compressImage } from "@/lib/imageCompress";
import {
  quoteError,
  quotesApi,
  useQuoteConverter,
  type Quote,
  type QuoteFont,
  type QuoteSettings,
  type QuoteSettingsPatch,
  type QuoteTheme,
} from "@/lib/quotes";

const THEMES: { value: QuoteTheme; label: string; hint: string }[] = [
  { value: "modern", label: "Moderno", hint: "Franja de color arriba, tabla con filas suaves." },
  { value: "classic", label: "Clásico", hint: "Sobrio, con doble línea de color." },
  { value: "minimal", label: "Minimalista", hint: "Mucho aire; el color solo en el total." },
  { value: "bold", label: "Destacado", hint: "Banda lateral y total grande en tu color." },
];

const FONTS: { value: QuoteFont; label: string; sample: string }[] = [
  { value: "sans", label: "Moderna", sample: "font-sans" },
  { value: "serif", label: "Clásica", sample: "font-serif" },
  { value: "mono", label: "Técnica", sample: "font-mono" },
];

const COLORS = ["#4f46e5", "#0ea5e9", "#059669", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#111827"];

/** Presupuesto de ejemplo para la vista previa (precios en dólares). */
function sampleQuote(validityDays: number): Quote {
  const now = new Date();
  const item = (name: string, brand: string, sku: string, qty: number, final: number) => ({
    kind: "product" as const,
    provider: "ELIT",
    externalId: sku,
    name,
    imageUrl: null,
    brand,
    sku,
    qty,
    unitPrice: Math.round((final / 1.21) * 100) / 100,
    unitFinalPrice: final,
    currency: "USD",
    pricedAt: now.toISOString(),
    marginPercent: null,
    marginSource: "provider" as const,
  });
  const items = [
    item("Procesador AMD Ryzen 5 5600 AM4 con cooler", "AMD", "100-100000927BOX", 1, 139.9),
    item("Memoria Kingston Fury Beast DDR4 16GB 3200MHz", "Kingston", "KF432C16BB/16", 2, 42.35),
    item("Disco SSD NVMe Western Digital SN580 1TB", "WD", "WDS100T3B0E", 1, 71.5),
    { ...item("Armado, prueba y sistema operativo", "", "", 1, 30), kind: "custom" as const, provider: "CUSTOM", externalId: "armado", brand: null, sku: null, marginSource: "manual" as const },
  ];
  const sum = items.reduce((s, i) => s + i.unitFinalPrice * i.qty, 0);
  return {
    id: "ejemplo",
    number: 12,
    initials: "JP",
    title: "Oficina Pérez · PC de escritorio",
    clientName: "Juan Pérez",
    clientPhone: "11 5555-1234",
    clientEmail: "juan@ejemplo.com",
    notes: "Entrega en 48 h hábiles una vez confirmado.",
    terms: null,
    items,
    totals: { USD: sum },
    subtotals: { USD: sum },
    discounts: {},
    itemCount: 5,
    status: "DRAFT",
    validUntil: new Date(now.getTime() + validityDays * 86_400_000).toISOString(),
    marginPercent: null,
    discountPercent: 5,
    currency: null,
    atCostLines: 0,
    canEditMargins: true,
    sentAt: null,
    decidedAt: null,
    createdById: "",
    createdByName: null,
    mine: true,
    archivedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** Plantilla del PDF de presupuestos: estilo, color, letra, logo, datos y textos, con vista previa real. */
export default function QuoteTemplatePage() {
  const role = getTenant()?.role;
  const canEdit = role === "OWNER" || role === "ADMIN";
  const [saved, setSaved] = useState<QuoteSettings | null>(null);
  const [draft, setDraft] = useState<QuoteSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const money = useQuoteConverter(null);

  useEffect(() => {
    void loadQuoteSettings(true)
      .then((s) => {
        setSaved(s);
        setDraft(s);
      })
      .catch((err) => setError(quoteError(err, "No se pudo cargar la plantilla")));
  }, []);

  const dirty = useMemo(() => Boolean(saved && draft && JSON.stringify(saved) !== JSON.stringify(draft)), [saved, draft]);

  // Vista previa: el mismo PDF que recibe el cliente, con un presupuesto de ejemplo.
  const previewUrl = useRef<string | null>(null);
  useEffect(() => {
    if (!draft) return;
    let alive = true;
    const t = setTimeout(async () => {
      setRendering(true);
      try {
        const built = buildQuotePdfModel(sampleQuote(draft.validityDays), draft, money);
        if (!("model" in built)) return;
        const { renderQuotePdf } = await import("@/components/quotes/pdf/generate");
        const blob = await renderQuotePdf(built.model, draft.logoUrl);
        if (!alive) return;
        const url = URL.createObjectURL(blob);
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = url;
        setPreview(url);
      } catch {
        /* la vista previa no frena el guardado */
      } finally {
        if (alive) setRendering(false);
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // money cambia de identidad en cada render; alcanza con la moneda y la cotización.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, money.currency, money.rate]);

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  function set<K extends keyof QuoteSettings>(key: K, value: QuoteSettings[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setOk(false);
  }

  async function save() {
    if (!draft || !saved) return;
    setSaving(true);
    setError(null);
    try {
      const patch: QuoteSettingsPatch = {};
      for (const key of Object.keys(draft) as (keyof QuoteSettings)[]) {
        if (key === "logoUrl" || key === "updatedAt") continue;
        if (JSON.stringify(draft[key]) !== JSON.stringify(saved[key])) (patch as Record<string, unknown>)[key] = draft[key];
      }
      const { data } = await quotesApi.saveSettings(patch);
      setSaved(data);
      setDraft(data);
      publishQuoteSettings(data);
      setOk(true);
    } catch (err) {
      setError(quoteError(err, "No se pudo guardar la plantilla"));
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    setError(null);
    try {
      const small = await compressImage(file);
      const data = await quotesApi.uploadLogo(small);
      setSaved((s) => (s ? { ...s, logoUrl: data.logoUrl, updatedAt: data.updatedAt } : data));
      setDraft((d) => (d ? { ...d, logoUrl: data.logoUrl, updatedAt: data.updatedAt } : data));
      publishQuoteSettings(data);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : quoteError(err, "No se pudo subir el logo"));
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    setLogoBusy(true);
    try {
      const { data } = await quotesApi.removeLogo();
      setSaved((s) => (s ? { ...s, logoUrl: null } : data));
      setDraft((d) => (d ? { ...d, logoUrl: null } : data));
      publishQuoteSettings(data);
    } catch (err) {
      setError(quoteError(err, "No se pudo quitar el logo"));
    } finally {
      setLogoBusy(false);
    }
  }

  const label = "text-[11px] font-semibold uppercase tracking-wider text-surface-500";
  const input =
    "w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white placeholder:text-surface-600 focus:border-brand-500 focus:outline-none disabled:opacity-60";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-surface-800 bg-surface-950 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/presupuestos" className="rounded-md p-1 text-surface-400 hover:bg-surface-800 hover:text-white" aria-label="Volver a presupuestos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-white">Plantilla del PDF</h1>
            <p className="hidden truncate text-xs text-surface-500 sm:block">Cómo ven tus clientes los presupuestos: logo, colores, datos y condiciones.</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {ok && !dirty && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                <Check className="h-3.5 w-3.5" /> Guardada
              </span>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
            </button>
          </div>
        )}
      </header>

      {!draft ? (
        <div className="flex flex-1 items-center justify-center">
          {error ? <p className="text-sm text-red-300">{error}</p> : <Loader2 className="h-5 w-5 animate-spin text-surface-500" />}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 overflow-y-auto lg:w-[28rem] lg:flex-shrink-0 lg:border-r lg:border-surface-800">
            <div className="flex flex-col gap-6 px-4 py-5 sm:px-6">
              {!canEdit && (
                <p className="flex items-center gap-2 rounded-lg border border-surface-800 bg-surface-900/60 px-3 py-2 text-xs text-surface-400">
                  <Lock className="h-3.5 w-3.5" /> La plantilla la cambian el dueño o un administrador.
                </p>
              )}
              {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

              <section>
                <p className={label}>Estilo</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => set("theme", t.value)}
                      aria-pressed={draft.theme === t.value}
                      className={`rounded-xl border p-2.5 text-left transition ${
                        draft.theme === t.value ? "border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/30" : "border-surface-700 hover:border-surface-500"
                      }`}
                    >
                      <ThemeThumb theme={t.value} color={draft.accentColor} />
                      <span className="mt-2 block text-xs font-semibold text-white">{t.label}</span>
                      <span className="block text-[10px] leading-snug text-surface-500">{t.hint}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className={label}>Color</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => set("accentColor", c)}
                      aria-label={`Color ${c}`}
                      className={`h-8 w-8 rounded-full border-2 ${draft.accentColor === c ? "border-white" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <label className="flex items-center gap-1.5 rounded-lg border border-surface-700 px-2 py-1 text-xs text-surface-300">
                    <input
                      type="color"
                      value={draft.accentColor}
                      disabled={!canEdit}
                      onChange={(e) => set("accentColor", e.target.value)}
                      className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label="Elegir otro color"
                    />
                    El de tu marca
                  </label>
                </div>
              </section>

              <section>
                <p className={label}>Letra</p>
                <div className="mt-2 flex gap-2">
                  {FONTS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => set("font", f.value)}
                      aria-pressed={draft.font === f.value}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm ${f.sample} ${
                        draft.font === f.value ? "border-brand-500 bg-brand-500/10 text-white" : "border-surface-700 text-surface-300 hover:border-surface-500"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <p className={label}>Logo</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-lg border border-surface-700 bg-white">
                    {draft.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxyImg(draft.logoUrl, { trim: false })} alt="Logo" className="max-h-14 max-w-[6.5rem] object-contain" />
                    ) : (
                      <span className="text-[10px] text-surface-400">Sin logo</span>
                    )}
                  </span>
                  {canEdit && (
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={logoBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-surface-700 px-3 py-1.5 text-xs font-medium text-surface-200 hover:border-surface-500 hover:text-white disabled:opacity-60"
                      >
                        {logoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                        {draft.logoUrl ? "Cambiar" : "Subir logo"}
                      </button>
                      {draft.logoUrl && (
                        <button type="button" onClick={() => void removeLogo()} disabled={logoBusy} className="inline-flex items-center gap-1 text-[11px] text-surface-500 hover:text-red-300">
                          <Trash2 className="h-3 w-3" /> Quitar
                        </button>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void uploadLogo(f);
                        }}
                      />
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-surface-500">Mejor en PNG con fondo transparente. Se guarda al subirlo.</p>
              </section>

              <section className="grid gap-2.5">
                <p className={label}>Datos del comercio</p>
                <input className={input} disabled={!canEdit} value={draft.businessName} maxLength={120} onChange={(e) => set("businessName", e.target.value)} placeholder="Nombre que ve el cliente" aria-label="Nombre del comercio" />
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} disabled={!canEdit} value={draft.taxId ?? ""} maxLength={40} onChange={(e) => set("taxId", e.target.value || null)} placeholder="CUIT" aria-label="CUIT" />
                  <input className={input} disabled={!canEdit} value={draft.phone ?? ""} maxLength={60} onChange={(e) => set("phone", e.target.value || null)} placeholder="Teléfono / WhatsApp" aria-label="Teléfono" />
                </div>
                <input className={input} disabled={!canEdit} value={draft.address ?? ""} maxLength={200} onChange={(e) => set("address", e.target.value || null)} placeholder="Dirección" aria-label="Dirección" />
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} disabled={!canEdit} value={draft.email ?? ""} maxLength={120} onChange={(e) => set("email", e.target.value || null)} placeholder="Mail" aria-label="Mail" inputMode="email" />
                  <input className={input} disabled={!canEdit} value={draft.website ?? ""} maxLength={120} onChange={(e) => set("website", e.target.value || null)} placeholder="Web o Instagram" aria-label="Web" />
                </div>
              </section>

              <section className="grid gap-2.5">
                <p className={label}>Textos</p>
                <textarea className={`${input} resize-none`} rows={2} disabled={!canEdit} value={draft.intro ?? ""} maxLength={1000} onChange={(e) => set("intro", e.target.value || null)} placeholder="Saludo arriba de los productos (ej.: Gracias por tu consulta, te pasamos el presupuesto.)" aria-label="Texto de presentación" />
                <textarea className={`${input} resize-none`} rows={4} disabled={!canEdit} value={draft.terms ?? ""} maxLength={3000} onChange={(e) => set("terms", e.target.value || null)} placeholder={"Condiciones: formas de pago, entrega, garantía.\nEj.: Precios sujetos a stock. Seña del 30 % para reservar."} aria-label="Condiciones" />
                <input className={input} disabled={!canEdit} value={draft.footer ?? ""} maxLength={300} onChange={(e) => set("footer", e.target.value || null)} placeholder="Pie de página (ej.: ¡Gracias por elegirnos!)" aria-label="Pie de página" />
              </section>

              <section className="grid gap-3">
                <p className={label}>Opciones</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-surface-400">
                    Validez (días)
                    <input
                      className={`${input} mt-1`}
                      disabled={!canEdit}
                      type="number"
                      min={1}
                      max={90}
                      value={draft.validityDays}
                      onChange={(e) => set("validityDays", Math.max(1, Math.min(90, Math.floor(Number(e.target.value) || 1))))}
                    />
                  </label>
                  <label className="text-xs text-surface-400">
                    Prefijo del número
                    <input className={`${input} mt-1`} disabled={!canEdit} maxLength={8} value={draft.numberPrefix} onChange={(e) => set("numberPrefix", e.target.value)} placeholder="P-" />
                  </label>
                </div>
                <div className="flex rounded-lg border border-surface-700 p-0.5 text-xs" role="radiogroup" aria-label="Precios">
                  {(
                    [
                      ["FINAL", "Precios con IVA"],
                      ["NET", "Sin IVA + IVA aparte"],
                    ] as const
                  ).map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={draft.priceDisplay === value}
                      disabled={!canEdit}
                      onClick={() => set("priceDisplay", value)}
                      className={`flex-1 rounded-md px-2 py-1.5 ${draft.priceDisplay === value ? "bg-surface-700 text-white" : "text-surface-400 hover:text-white"}`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                {(
                  [
                    ["showImages", "Fotos de los productos"],
                    ["showBrand", "Marca"],
                    ["showSku", "Código del producto"],
                  ] as const
                ).map(([key, text]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-surface-200">
                    <input type="checkbox" disabled={!canEdit} checked={draft[key]} onChange={(e) => set(key, e.target.checked)} className="h-4 w-4 rounded border-surface-600 bg-surface-800 text-brand-500" />
                    {text}
                  </label>
                ))}
                <label className="text-xs text-surface-400">
                  Descuento máximo para vendedores (sin acceso a costos)
                  <div className="relative mt-1 w-32">
                    <input
                      className={`${input} pr-7`}
                      disabled={!canEdit}
                      inputMode="decimal"
                      value={draft.maxSellerDiscount ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(",", ".").trim();
                        const n = raw === "" ? null : Number(raw);
                        if (n === null || (Number.isFinite(n) && n >= 0 && n <= 100)) set("maxSellerDiscount", n);
                      }}
                      placeholder="Sin tope"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-surface-500">%</span>
                  </div>
                </label>
              </section>
            </div>
          </div>

          <div className="flex min-h-[28rem] flex-1 flex-col bg-surface-900/40">
            <div className="flex items-center justify-between gap-2 border-b border-surface-800 px-4 py-2 text-xs text-surface-400">
              <span className="flex items-center gap-1.5">
                Vista previa con un presupuesto de ejemplo
                {rendering && <Loader2 className="h-3 w-3 animate-spin" />}
              </span>
              {preview && (
                <a href={preview} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-300 hover:text-brand-200">
                  Abrir <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {preview ? (
              <iframe key={preview} src={`${preview}#toolbar=0&navpanes=0&view=FitH`} title="Vista previa del PDF" className="min-h-[28rem] w-full flex-1 bg-white" />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-surface-500" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Miniatura de cada estilo, para elegir sin abrir el PDF. */
function ThemeThumb({ theme, color }: { theme: QuoteTheme; color: string }) {
  const bar = <span className="block h-1 rounded bg-surface-300/70" />;
  return (
    <span className="relative block h-20 overflow-hidden rounded-md border border-surface-700 bg-white p-1.5">
      {theme === "bold" && <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} />}
      {theme === "modern" ? (
        <span className="-mx-1.5 -mt-1.5 mb-1.5 block h-5" style={{ backgroundColor: color }} />
      ) : (
        <span className="mb-1.5 flex items-center justify-between">
          <span className="block h-1.5 w-8 rounded bg-surface-400" />
          <span className="block h-2 w-6 rounded" style={{ backgroundColor: theme === "minimal" ? "#9ca3af" : color }} />
        </span>
      )}
      {theme === "classic" && <span className="mb-1.5 block h-0.5" style={{ backgroundColor: color }} />}
      <span className="grid gap-1 pl-1">
        {bar}
        {bar}
        {bar}
      </span>
      <span
        className="absolute bottom-1.5 right-1.5 block h-2.5 w-10 rounded-sm"
        style={{ backgroundColor: theme === "minimal" || theme === "classic" ? "transparent" : color, borderTop: theme === "minimal" ? `2px solid ${color}` : theme === "classic" ? "2px solid #111827" : undefined }}
      />
    </span>
  );
}
