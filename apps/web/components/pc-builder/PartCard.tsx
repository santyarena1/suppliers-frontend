"use client";

import { useState } from "react";
import { Check, ChevronDown, ImageOff } from "lucide-react";
import type { ProductDTO } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { DistName } from "./Dist";
import { keySpecs, type Level, type PcPart, type PcStep } from "@/lib/pc-builder/compat";
import { inStock, offerKey, useOfferPricer } from "@/lib/pc-builder/state";

const LEVEL_TEXT: Record<Level, string> = { ok: "text-emerald-300", warn: "text-amber-300", bad: "text-red-300" };

/** Un producto del paso: foto, datos clave, compatibilidad y dónde comprarlo. */
export default function PartCard({
  step, part, verdictLevel, verdictText, selected, selectedOffer, onChoose,
}: {
  step: PcStep;
  part: PcPart;
  verdictLevel: Level | null;
  verdictText: string | null;
  selected: boolean;
  selectedOffer: string | null;
  onChoose: (offer: string | null) => void;
}) {
  const price = useOfferPricer();
  const [open, setOpen] = useState(false);
  const offers = part.offers
    .map((o) => ({ o, p: price(o), stock: inStock(o) }))
    .sort((a, b) => Number(b.stock) - Number(a.stock) || (a.p?.usd ?? 9e9) - (b.p?.usd ?? 9e9));
  const best = offers.find((x) => x.stock && x.p) ?? null;
  const shown = selected && selectedOffer ? offers.find((x) => offerKey(x.o) === selectedOffer) ?? best : best;
  const [imgFailed, setImgFailed] = useState(false);
  const fallback = part.offers.find((o) => o.imageUrl)?.imageUrl ?? null;
  // La foto de la ficha va cifrada; si no carga, la del distribuidor.
  const image = (!imgFailed && part.image) || fallback;
  const blocked = verdictLevel === "bad";

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border bg-surface-900 transition-colors ${
        selected ? "border-brand-500 ring-1 ring-brand-500/40" : blocked ? "border-surface-800 opacity-60" : "border-surface-800 hover:border-surface-600"
      }`}
    >
      <div className="relative aspect-[4/3] bg-white">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(image)} alt="" loading="lazy" onError={() => setImgFailed(true)} className="absolute inset-0 h-full w-full object-contain p-4" />
        ) : (
          <ImageOff className="absolute inset-0 m-auto h-6 w-6 text-surface-400" />
        )}
        {selected && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 text-[11px] font-semibold text-white">
            <Check className="h-3 w-3" /> En tu armado
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <h3 className="line-clamp-2 min-h-[2.6em] text-sm font-semibold leading-snug text-white" title={part.name}>{part.name}</h3>
        <p className="line-clamp-2 text-xs leading-relaxed text-surface-400">{keySpecs(step, part).join(" · ")}</p>
        {verdictText && <p className={`text-xs leading-snug ${LEVEL_TEXT[verdictLevel ?? "ok"]}`}>{verdictText}</p>}

        <div className="mt-auto border-t border-surface-800 pt-2.5">
          {shown?.p ? (
            <div className="flex items-end justify-between gap-2">
              <DistName provider={shown.o.provider} sub={shown.stock ? (shown.o.stock ? `${shown.o.stock} en stock` : "con stock") : "sin stock"} size={28} />
              <span className="whitespace-nowrap font-mono text-base font-semibold tabular-nums text-white">{shown.p.label}</span>
            </div>
          ) : (
            <p className="text-xs text-surface-500">Sin precio ni stock en tus distribuidores</p>
          )}
          {offers.length > 1 && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-300 hover:text-white">
              {open ? "Ocultar" : `Ver ${offers.length} distribuidores`}
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
          {open && (
            <ul className="mt-2 flex flex-col gap-1">
              {offers.map(({ o, p, stock }) => (
                <li key={offerKey(o)}>
                  <button
                    type="button"
                    disabled={!stock || !p || blocked}
                    onClick={() => onChoose(offerKey(o))}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected && selectedOffer === offerKey(o) ? "border-brand-500 bg-brand-600/10" : "border-surface-800 hover:border-surface-600"
                    }`}
                  >
                    <DistName provider={o.provider} sub={stock ? (o.stock ? `${o.stock} en stock` : "con stock") : "sin stock"} size={26} />
                    <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-white">{p?.label ?? "—"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          disabled={blocked || !best}
          onClick={() => onChoose(null)}
          className={`mt-1 h-9 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            selected ? "border border-brand-500 text-brand-200 hover:bg-brand-600/10" : "bg-brand-600 text-white hover:bg-brand-500"
          }`}
        >
          {selected ? "Elegido" : blocked ? "No es compatible" : "Elegir"}
        </button>
      </div>
    </article>
  );
}

export type { ProductDTO };
