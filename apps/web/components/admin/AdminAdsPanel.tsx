"use client";

import { useEffect, useState } from "react";
import { adminAdsApi, type AdCampaign, type AdSlot } from "@/lib/api";
import { Loader2, Megaphone } from "lucide-react";

export default function AdminAdsPanel({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [slots, setSlots] = useState<AdSlot[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await adminAdsApi.list();
    setSlots(res.data.slots);
    setCampaigns(res.data.campaigns);
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => {
      showToast("No se pudo cargar la publicidad", false);
      setLoading(false);
    });
    // showToast cambia en cada render del padre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patch(slot: AdSlot, data: Partial<AdSlot>, ok: string) {
    try {
      await adminAdsApi.updateSlot(slot.id, data);
      showToast(ok);
      await load();
    } catch {
      showToast("No se pudo actualizar el espacio", false);
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
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-brand-400" />
        <p className="text-sm text-surface-300">
          Prendé los espacios que están a la venta y poneles precio mensual. El distribuidor elige dónde aparecer; no es un check único. La cuenta de publicidad se habilita en la ficha de la organización.
        </p>
      </div>
      <div className="border border-surface-800 rounded-xl overflow-hidden">
        {slots.map((slot) => (
          <div key={slot.id} className="px-4 py-3 border-t border-surface-800 first:border-t-0 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm text-white">{slot.name}</p>
              <p className="text-[11px] text-surface-500">{slot.description}</p>
            </div>
            <label className="flex flex-col gap-0.5 text-[10px] text-surface-500">
              USD / mes
              <input
                type="number"
                min={0}
                defaultValue={slot.monthlyPriceUsd}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next) || next === slot.monthlyPriceUsd) return;
                  void patch(slot, { monthlyPriceUsd: next }, "Precio actualizado");
                }}
                className="w-20 bg-surface-800 border border-surface-700 rounded-md px-2 py-1 text-xs text-white"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px] text-surface-500">
              Cupo
              <input
                type="number"
                min={1}
                defaultValue={slot.maxConcurrent}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next) || next < 1 || next === slot.maxConcurrent) return;
                  void patch(slot, { maxConcurrent: next }, "Cupo actualizado");
                }}
                className="w-16 bg-surface-800 border border-surface-700 rounded-md px-2 py-1 text-xs text-white"
              />
            </label>
            <button
              type="button"
              onClick={() => void patch(slot, { enabled: !slot.enabled }, slot.enabled ? "Espacio cerrado" : "Espacio a la venta")}
              className={`text-xs rounded-full px-3 py-1 ${slot.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-surface-800 text-surface-400"}`}
            >
              {slot.enabled ? "A la venta" : "Cerrado"}
            </button>
          </div>
        ))}
      </div>
      <div className="border border-surface-800 rounded-xl overflow-hidden">
        <p className="text-xs font-semibold text-white px-4 py-3 border-b border-surface-800">Campañas</p>
        {campaigns.length === 0 ? (
          <p className="text-xs text-surface-500 px-4 py-6">Nadie contrató un espacio todavía.</p>
        ) : (
          campaigns.map((campaign) => (
            <div key={campaign.id} className="px-4 py-2.5 border-t border-surface-800 flex flex-wrap gap-2 text-[12px]">
              <span className="text-white">{campaign.advertiser ?? campaign.tenantId}</span>
              <span className="text-surface-500">{campaign.slot.name}</span>
              <span className="text-surface-400">{campaign.status}</span>
              <span className="text-surface-500">{campaign.title}</span>
              <span className="text-surface-500">
                {campaign.stats?.impressions ?? 0} imp. · {campaign.stats?.clicks ?? 0} clicks
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
