"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  adminApi,
  ProviderDisplay,
  BrandDisplay,
  Banner,
  ALL_PROVIDERS,
  PROVIDER_LABELS,
} from "@/lib/api";
import {
  Loader2, Plus, Trash2, X,
} from "lucide-react";
import {
  BANNER_SLOTS,
  BANNER_BENTO_CONTAINER,
  BANNER_SLOT_BENTO,
  BANNER_SLOT_ORDER,
  BANNER_SLOT_RECOMMENDED,
  BRAND_PRESET_LABELS,
  BRAND_PRESETS,
  type BrandPreset,
  type BannerSlot,
} from "@/lib/brand-presets";
import { useBranding } from "@/lib/branding";
import ImageUploadField from "@/components/ImageUploadField";
import { assetUrl } from "@/lib/assets";
import { invalidateProviderDisplayCache } from "@/lib/providerDisplay";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export type ConfigToast = (msg: string, ok?: boolean) => void;

// ---------- Proveedores ----------

export function ProvidersTab({ showToast }: { showToast: ConfigToast }) {
  const [rows, setRows] = useState<ProviderDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.listProviderDisplay().then((r) => setRows(r.data)).catch(() => setRows(ALL_PROVIDERS.map((p) => ({ provider: p, visible: true, logoUrl: null, textColor: null })))).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function update(provider: ProviderDisplay["provider"], patch: Partial<ProviderDisplay>) {
    setRows((prev) => prev.map((r) => (r.provider === provider ? { ...r, ...patch } : r)));
    try {
      await adminApi.updateProviderDisplay(provider, patch);
      invalidateProviderDisplayCache();
    } catch (err) {
      showToast(errMsg(err, "Error al guardar"), false);
      load();
    }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>;

  return (
    <div className="max-w-3xl flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-white mb-2">Visibilidad y marca de proveedores</h2>
      {rows.map((r) => (
        <div key={r.provider} className="flex items-center gap-3 border border-surface-800 rounded-xl px-4 py-3">
          <div className="w-6 h-6 rounded bg-surface-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
            {r.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetUrl(r.logoUrl)} alt="" className="w-full h-full object-contain" />
            ) : null}
          </div>
          <span className="text-sm font-medium text-surface-200 w-40 flex-shrink-0" style={r.textColor ? { color: r.textColor } : undefined}>
            {PROVIDER_LABELS[r.provider]}
          </span>
          <ImageUploadField
            variant="inline"
            value={r.logoUrl ?? ""}
            onChange={(url) => setRows((prev) => prev.map((x) => (x.provider === r.provider ? { ...x, logoUrl: url || null } : x)))}
            onCommit={(url) => update(r.provider, { logoUrl: url || undefined })}
            placeholder="URL o subir logo"
          />
          <input
            type="color"
            value={r.textColor ?? "#a1a1aa"}
            onChange={(e) => update(r.provider, { textColor: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer bg-transparent border border-surface-700"
          />
          <button
            onClick={() => update(r.provider, { visible: !r.visible })}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-md border flex-shrink-0 ${
              r.visible ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-red-500/10 border-red-500/25 text-red-400"
            }`}
          >
            {r.visible ? "Visible" : "Oculto"}
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- Marcas ----------

export function BrandsTab({ showToast }: { showToast: ConfigToast }) {
  const [rows, setRows] = useState<BrandDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.listBrandDisplay().then((r) => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function update(id: string, patch: Partial<BrandDisplay>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      await adminApi.updateBrandDisplay(id, patch);
    } catch (err) {
      showToast(errMsg(err, "Error al guardar"), false);
      load();
    }
  }

  return (
    <div className="max-w-3xl flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-white">Visibilidad y marca</h2>
      <p className="text-xs text-surface-500 -mt-2">
        El Portal de Marcas todavía corre sobre datos de prueba en el frontend (el backend real
        de Marcas no está construido) — estos controles quedan funcionando y guardados para
        cuando ese módulo tenga backend propio.
      </p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-surface-500 border border-surface-800 rounded-xl px-4 py-6 text-center">Todavía no hay marcas cargadas.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border border-surface-800 rounded-xl px-4 py-3">
              <div className="w-6 h-6 rounded bg-surface-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
                {r.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(r.logoUrl)} alt="" className="w-full h-full object-contain" />
                ) : null}
              </div>
              <span className="text-sm font-medium text-surface-200 w-40 flex-shrink-0 truncate" style={r.textColor ? { color: r.textColor } : undefined}>
                {r.name}
              </span>
              <ImageUploadField
                variant="inline"
                value={r.logoUrl ?? ""}
                onChange={(url) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, logoUrl: url || null } : x)))}
                onCommit={(url) => update(r.id, { logoUrl: url || undefined })}
                placeholder="URL o subir logo"
              />
              <input
                type="color"
                value={r.textColor ?? "#a1a1aa"}
                onChange={(e) => update(r.id, { textColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border border-surface-700"
              />
              <button
                onClick={() => update(r.id, { visible: !r.visible })}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md border flex-shrink-0 ${
                  r.visible ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-red-500/10 border-red-500/25 text-red-400"
                }`}
              >
                {r.visible ? "Visible" : "Oculta"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Banners ----------

function slotLabel(slot: BannerSlot) {
  return BANNER_SLOTS.find((s) => s.value === slot)?.label ?? slot;
}

export function BannersTab({ showToast }: { showToast: ConfigToast }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    position: "search" as "home" | "search",
    slot: "hero_main" as BannerSlot,
    imageUrl: "",
    title: "",
    subtitle: "",
    linkUrl: "",
    order: 0,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.listBanners().then((r) => setBanners(r.data)).catch(() => setBanners([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const occupiedBySlot = useMemo(() => {
    const map = new Map<string, Banner>();
    for (const b of banners) {
      if (b.position !== form.position) continue;
      if (!b.slot) continue;
      // Preferir activo si hay varios en el mismo slot
      const prev = map.get(b.slot);
      if (!prev || (b.active && !prev.active)) map.set(b.slot, b);
    }
    return map;
  }, [banners, form.position]);

  function openCreate(slot?: BannerSlot) {
    setForm((prev) => ({
      ...prev,
      slot: slot ?? prev.slot,
      imageUrl: "",
      title: "",
      subtitle: "",
      linkUrl: "",
      order: 0,
    }));
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.createBanner(form);
      showToast("Banner creado");
      setShowCreate(false);
      setForm((prev) => ({
        ...prev,
        slot: "hero_main",
        imageUrl: "",
        title: "",
        subtitle: "",
        linkUrl: "",
        order: 0,
      }));
      load();
    } catch (err) {
      showToast(errMsg(err, "Error al crear el banner"), false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: Banner) {
    try {
      await adminApi.updateBanner(b.id, { active: !b.active });
      load();
    } catch (err) {
      showToast(errMsg(err, "Error al actualizar"), false);
    }
  }

  async function remove(b: Banner) {
    if (!window.confirm("¿Eliminar este banner?")) return;
    try {
      await adminApi.deleteBanner(b.id);
      showToast("Banner eliminado");
      load();
    } catch (err) {
      showToast(errMsg(err, "Error al eliminar"), false);
    }
  }

  const selectedSize = BANNER_SLOT_RECOMMENDED[form.slot];

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-white">Banners ({banners.length})</h2>
          <p className="text-xs text-surface-500 mt-0.5">
            Tocá un espacio del maquetado para cargar la imagen en ese lugar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value as "home" | "search" })}
            className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
          >
            <option value="search">Vista: Buscador</option>
            <option value="home">Vista: Home</option>
          </select>
          <button
            type="button"
            onClick={() => openCreate()}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Nuevo banner
          </button>
        </div>
      </div>

      {/* Maquetado bento — mismo layout que el buscador */}
      <div className="mb-6 border border-surface-800 rounded-2xl p-3 sm:p-4 bg-surface-900/40 overflow-hidden">
        <p className="text-[10px] uppercase tracking-wider text-surface-500 font-semibold mb-3">
          Maquetado · {form.position === "search" ? "Buscador" : "Home"} · tocá un espacio
        </p>
        <div className={BANNER_BENTO_CONTAINER}>
          {BANNER_SLOT_ORDER.map((slot) => {
            const meta = BANNER_SLOT_RECOMMENDED[slot];
            const occupied = occupiedBySlot.get(slot);
            const selected = showCreate && form.slot === slot;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => openCreate(slot)}
                className={`${BANNER_SLOT_BENTO[slot]} relative overflow-hidden rounded-2xl border text-left transition-all ${
                  selected
                    ? "border-brand-500 ring-1 ring-brand-500/40 bg-brand-600/10"
                    : occupied
                      ? "border-surface-700 bg-surface-900 hover:border-brand-500/50"
                      : "border-dashed border-surface-700 bg-surface-950/80 hover:border-brand-500/60 hover:bg-brand-600/5"
                }`}
              >
                {occupied?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl(occupied.imageUrl)}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-75"
                  />
                ) : null}
                <div className={`relative z-10 p-2.5 sm:p-3 flex flex-col justify-between h-full min-h-[100px] md:min-h-0 md:h-full ${occupied?.imageUrl ? "bg-gradient-to-t from-black/80 via-black/25 to-transparent" : ""}`}>
                  <div>
                    <p className={`text-xs font-semibold ${occupied ? "text-white" : "text-surface-300"}`}>
                      {slotLabel(slot)}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${occupied ? "text-white/70" : "text-surface-500"}`}>
                      {meta.width}×{meta.height}px
                    </p>
                  </div>
                  <p className={`text-[10px] mt-2 leading-snug ${occupied ? "text-white/60" : "text-surface-600"}`}>
                    {occupied ? (occupied.active ? "Cargado" : "Inactivo") : "Vacío · cargar"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
      ) : banners.length === 0 ? (
        <p className="text-xs text-surface-500 border border-surface-800 rounded-xl px-4 py-6 text-center">
          Todavía no hay banners. Elegí un espacio del maquetado para empezar.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {banners.map((b) => {
            const size = b.slot ? BANNER_SLOT_RECOMMENDED[b.slot as BannerSlot] : null;
            return (
              <div key={b.id} className="flex items-center gap-3 border border-surface-800 rounded-xl px-4 py-3">
                <div className="w-16 h-10 rounded bg-surface-800 flex-shrink-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(b.imageUrl)} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-surface-200 truncate">{b.title || "(sin título)"}</p>
                  <p className="text-[11px] text-surface-500">
                    {b.position === "home" ? "Home" : "Buscador"}
                    {b.slot ? ` · ${slotLabel(b.slot as BannerSlot)}` : ""}
                    {size ? ` · ${size.width}×${size.height}` : ""}
                    {` · orden ${b.order}`}
                  </p>
                </div>
                <button
                  onClick={() => toggleActive(b)}
                  className={`text-xs font-medium px-2.5 py-1.5 rounded-md border flex-shrink-0 ${
                    b.active ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-red-500/10 border-red-500/25 text-red-400"
                  }`}
                >
                  {b.active ? "Activo" : "Inactivo"}
                </button>
                <button onClick={() => remove(b)} className="text-surface-500 hover:text-red-400 transition-colors flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-950 border border-surface-800 rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Nuevo banner</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-surface-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="rounded-xl border border-surface-800 bg-surface-900/50 p-3">
                <p className="text-xs font-medium text-white">{slotLabel(form.slot)}</p>
                <p className="text-[11px] text-brand-400 mt-1">
                  Medida recomendada: <span className="font-semibold">{selectedSize.width}×{selectedSize.height}px</span>
                </p>
                <p className="text-[10px] text-surface-500 mt-1 leading-snug">{selectedSize.hint}</p>
              </div>

              <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value as "home" | "search" })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                <option value="home">Home</option>
                <option value="search">Buscador</option>
              </select>
              <select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value as BannerSlot })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500">
                {BANNER_SLOTS.map((s) => {
                  const size = BANNER_SLOT_RECOMMENDED[s.value];
                  return (
                    <option key={s.value} value={s.value}>
                      {s.label} · {size.width}×{size.height}
                    </option>
                  );
                })}
              </select>
              <ImageUploadField
                required
                value={form.imageUrl}
                onChange={(url) => setForm({ ...form, imageUrl: url })}
                placeholder="URL de la imagen"
              />
              <input placeholder="Título (opcional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
              <input placeholder="Subtítulo (opcional)" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
              <input placeholder="Link (opcional)" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
              <input type="number" placeholder="Orden" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} className="bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-brand-500" />
              <button type="submit" disabled={saving || !form.imageUrl} className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg py-2.5 transition-all mt-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear banner"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Apariencia (identidad visual) ----------

export function AppearanceTab({ showToast }: { showToast: ConfigToast }) {
  const { preset: livePreset, setPreset: applyLive } = useBranding();
  const [preset, setPreset] = useState<BrandPreset>(livePreset);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPreset(livePreset);
  }, [livePreset]);

  useEffect(() => {
    adminApi.getPlatformSettings()
      .then((r) => {
        const p = r.data.brandPreset as BrandPreset;
        const next = p in BRAND_PRESET_LABELS ? p : "violet";
        setPreset(next);
        applyLive(next);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [applyLive]);

  async function save() {
    setSaving(true);
    try {
      await adminApi.updatePlatformSettings(preset);
      applyLive(preset);
      showToast("Identidad visual actualizada");
    } catch (err) {
      showToast(errMsg(err, "Error al guardar"), false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-sm font-semibold text-white mb-1">Identidad visual</h2>
      <p className="text-xs text-surface-500 mb-5 leading-relaxed">
        Cambia el color principal del sistema para todos los usuarios. El violeta NODO es el predeterminado; otros presets (ej. rojo gamer) quedan disponibles como alternativa.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {(Object.keys(BRAND_PRESET_LABELS) as BrandPreset[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setPreset(key);
              applyLive(key);
            }}
            className={`rounded-xl border p-4 text-left transition-all ${
              preset === key
                ? "border-brand-500 bg-brand-600/10 ring-1 ring-brand-500/30"
                : "border-surface-800 bg-surface-900 hover:border-surface-600"
            }`}
          >
            <div
              className="w-full h-8 rounded-lg mb-3"
              style={{ backgroundColor: `rgb(${BRAND_PRESETS[key][600]})` }}
            />
            <p className="text-sm font-medium text-white">{BRAND_PRESET_LABELS[key]}</p>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-all"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar para todos los usuarios"}
      </button>
    </div>
  );
}
