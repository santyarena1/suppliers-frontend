"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PrefsPanel from "@/components/PrefsPanel";
import { adsApi, newsApi, type AdCampaign, type AdSlot, type NewsCard } from "@/lib/api";
import { Loader2, Megaphone } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function ctr(impressions: number, clicks: number) {
  if (impressions <= 0) return "—";
  return `${((clicks / impressions) * 100).toFixed(1)}%`;
}

/**
 * Publicidad paga: el admin prende espacios y pone precio. Acá el distribuidor
 * elige dónde aparecer, ve el costo mensual y las impresiones/clicks.
 */
export default function PublicidadPage() {
  const [allowed, setAllowed] = useState(false);
  const [monthlyDue, setMonthlyDue] = useState(0);
  const [slots, setSlots] = useState<AdSlot[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  const [slotId, setSlotId] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [articleId, setArticleId] = useState("");
  const [notes, setNotes] = useState<NewsCard[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [res, own] = await Promise.all([adsApi.mine(), newsApi.mine().catch(() => ({ data: { items: [] as NewsCard[] } }))]);
    setAllowed(res.data.allowed);
    setMonthlyDue(res.data.monthlyDue);
    setSlots(res.data.slots);
    setCampaigns(res.data.campaigns);
    setNotes(own.data.items.filter((n) => n.status === "PUBLISHED"));
    setSlotId((current) => current || res.data.slots.find((s) => s.enabled)?.id || res.data.slots[0]?.id || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setAviso({ ok: false, text: errMsg(err, "No se pudo cargar la publicidad") });
      setLoading(false);
    });
  }, [load]);

  async function create() {
    if (!title.trim() || !slotId) return;
    setSaving(true);
    try {
      await adsApi.createCampaign({
        slotId,
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        linkUrl: linkUrl.trim() || undefined,
        articleId: articleId || undefined,
        status: "DRAFT",
      });
      setTitle("");
      setSubtitle("");
      setLinkUrl("");
      setImageUrl("");
      setArticleId("");
      setAviso({ ok: true, text: "Campaña creada en borrador. Activarla suma el costo mensual." });
      await load();
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo crear") });
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(campaign: AdCampaign, status: AdCampaign["status"]) {
    try {
      await adsApi.updateCampaign(campaign.id, {
        slotId: campaign.slot.id,
        title: campaign.title,
        subtitle: campaign.subtitle,
        imageUrl: campaign.imageUrl ?? undefined,
        linkUrl: campaign.linkUrl ?? undefined,
        status,
      });
      await load();
    } catch (err) {
      setAviso({ ok: false, text: errMsg(err, "No se pudo actualizar") });
    }
  }

  const selectedSlot = slots.find((s) => s.id === slotId);
  const newsSlot = selectedSlot?.key === "news_hero";
  const enabledSlots = slots.filter((slot) => slot.enabled);
  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, campaign) => {
        acc.impressions += campaign.stats?.impressions ?? 0;
        acc.clicks += campaign.stats?.clicks ?? 0;
        return acc;
      },
      { impressions: 0, clicks: 0 }
    );
  }, [campaigns]);

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Publicidad</h1>
          <p className="text-xs text-surface-500 hidden sm:block">Elegí espacios, mirá el costo y las visitas</p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4">
          {aviso && (
            <p className={`text-xs rounded-md px-3 py-2 ${aviso.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {aviso.text}
            </p>
          )}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-brand-500" /></div>
          ) : !allowed ? (
            <div className="border border-surface-800 rounded-xl p-8 text-center flex flex-col items-center gap-2">
              <Megaphone className="w-8 h-8 text-surface-600" />
              <p className="text-sm text-surface-300">Tu cuenta todavía no tiene publicidad habilitada.</p>
              <p className="text-xs text-surface-500 max-w-md">
                El administrador de NODO prende el permiso en tu organización cuando pagan. Recién ahí podés comprar espacios y ver estadísticas.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border border-surface-800 rounded-xl px-4 py-3">
                  <p className="text-[11px] text-surface-500 uppercase tracking-wider">A pagar este mes</p>
                  <p className="text-lg font-semibold text-white mt-1">USD {monthlyDue.toFixed(0)}</p>
                  <p className="text-[11px] text-surface-500">Suma de espacios activos</p>
                </div>
                <div className="border border-surface-800 rounded-xl px-4 py-3">
                  <p className="text-[11px] text-surface-500 uppercase tracking-wider">Impresiones</p>
                  <p className="text-lg font-semibold text-white mt-1">{totals.impressions}</p>
                  <p className="text-[11px] text-surface-500">{totals.clicks} clicks · CTR {ctr(totals.impressions, totals.clicks)}</p>
                </div>
                <div className="border border-surface-800 rounded-xl px-4 py-3">
                  <p className="text-[11px] text-surface-500 uppercase tracking-wider">Campañas</p>
                  <p className="text-lg font-semibold text-white mt-1">{campaigns.length}</p>
                </div>
              </div>
              <section className="border border-surface-800 rounded-xl p-4 flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-white">Nueva campaña</h2>
                <select value={slotId} onChange={(e) => setSlotId(e.target.value)} className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white">
                  {enabledSlots.length === 0 && <option value="">No hay espacios a la venta</option>}
                  {enabledSlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.name} · USD {slot.monthlyPriceUsd}/mes · cupo {slot.maxConcurrent}
                    </option>
                  ))}
                </select>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white" />
                <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtítulo" className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white" />
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="URL de imagen o /assets/…" className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white" />
                {newsSlot ? (
                  <select value={articleId} onChange={(e) => setArticleId(e.target.value)} className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white">
                    <option value="">Elegí la nota que va al hero</option>
                    {notes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://… o /search?q=…" className="bg-surface-800 border border-surface-700 rounded-md px-2.5 py-1.5 text-sm text-white" />
                )}
                <button type="button" disabled={saving || !title.trim() || !slotId} onClick={() => void create()} className="self-start bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs rounded-lg px-3 py-2">
                  {saving ? "Guardando…" : "Crear borrador"}
                </button>
              </section>
              <section className="border border-surface-800 rounded-xl overflow-hidden">
                <h2 className="text-xs font-semibold text-white px-4 py-3 border-b border-surface-800">Tus campañas</h2>
                {campaigns.length === 0 ? (
                  <p className="text-xs text-surface-500 px-4 py-6">Todavía no hay campañas.</p>
                ) : (
                  campaigns.map((campaign) => {
                    const impressions = campaign.stats?.impressions ?? 0;
                    const clicks = campaign.stats?.clicks ?? 0;
                    return (
                      <div key={campaign.id} className="px-4 py-3 border-t border-surface-800 flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[160px]">
                          <p className="text-sm text-white">{campaign.title}</p>
                          <p className="text-[11px] text-surface-500">
                            {campaign.slot.name} · USD {campaign.slot.monthlyPriceUsd}/mes · {campaign.status}
                          </p>
                        </div>
                        <p className="text-[11px] text-surface-400">
                          {impressions} impresiones · {clicks} clicks · CTR {ctr(impressions, clicks)}
                        </p>
                        {campaign.status !== "ACTIVE" ? (
                          <button type="button" className="text-xs text-brand-300" onClick={() => void setStatus(campaign, "ACTIVE")}>Activar</button>
                        ) : (
                          <button type="button" className="text-xs text-surface-400" onClick={() => void setStatus(campaign, "PAUSED")}>Pausar</button>
                        )}
                      </div>
                    );
                  })
                )}
              </section>
              <section>
                <h2 className="text-xs font-semibold text-white mb-2">Espacios</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {slots.map((slot) => (
                    <div key={slot.id} className={`border rounded-xl px-3 py-2 ${slot.enabled ? "border-surface-700" : "border-surface-800 opacity-60"}`}>
                      <p className="text-sm text-white">{slot.name}</p>
                      <p className="text-[11px] text-surface-500">{slot.description}</p>
                      <p className="text-[11px] text-brand-300 mt-1">USD {slot.monthlyPriceUsd}/mes · {slot.enabled ? "a la venta" : "cerrado"} · cupo {slot.maxConcurrent}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
