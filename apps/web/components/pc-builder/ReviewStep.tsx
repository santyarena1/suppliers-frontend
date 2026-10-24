"use client";

import { ImageOff } from "lucide-react";
import type { ProductDTO } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import { DistName, OfferPicker } from "./Dist";
import { STEP_LABEL, type PcStep } from "@/lib/pc-builder/compat";
import { PART_STEPS, inStock, offerKey, useOfferPricer, type ChosenPart, type CustomLine, type ExtraLine } from "@/lib/pc-builder/state";

/** Revisión final: todas las líneas, de qué distribuidor sale cada una y los chequeos. */
export default function ReviewStep({
  parts, offers, extras, custom, onOffer, onQty, onGo,
}: {
  parts: Partial<Record<PcStep, ChosenPart>>;
  offers: Partial<Record<PcStep, ProductDTO | null>>;
  extras: ExtraLine[];
  custom: CustomLine[];
  onOffer: (step: PcStep, key: string) => void;
  onQty: (step: PcStep, qty: number) => void;
  onGo: (step: PcStep) => void;
}) {
  const price = useOfferPricer();
  const thumb = (src: string | null | undefined) => (
    <span className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxyImg(src)} alt="" className="h-full w-full object-contain p-0.5" />
      ) : <ImageOff className="h-4 w-4 text-surface-400" />}
    </span>
  );

  return (
    <section className="flex flex-col gap-5" aria-label="Revisión del armado">
      <header>
        <h2 className="text-lg font-semibold text-white">Revisá el armado</h2>
        <p className="mt-1 text-sm text-surface-400">Tocá el distribuidor de una pieza para cambiarlo. Después creá el presupuesto o pasalo al carrito.</p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-surface-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-surface-800 text-left text-[11px] uppercase tracking-wide text-surface-500">
              <th className="px-3 py-2.5 font-semibold">Componente</th>
              <th className="px-3 py-2.5 font-semibold">Producto</th>
              <th className="px-3 py-2.5 font-semibold">Distribuidor</th>
              <th className="px-3 py-2.5 font-semibold">Cant.</th>
              <th className="px-3 py-2.5 text-right font-semibold">Precio</th>
            </tr>
          </thead>
          <tbody>
            {PART_STEPS.filter((s) => parts[s]).map((s) => {
              const c = parts[s]!;
              const o = offers[s];
              const p = o ? price(o) : null;
              const options = c.part.offers.filter((x) => inStock(x) && price(x));
              return (
                <tr key={s} className="border-b border-surface-800 last:border-0">
                  <td className="px-3 py-2.5 text-xs font-semibold text-surface-400"><button type="button" onClick={() => onGo(s)} className="hover:text-white">{STEP_LABEL[s]}</button></td>
                  <td className="px-3 py-2.5"><span className="flex items-center gap-3">{thumb(c.part.image ?? c.part.offers.find((x) => x.imageUrl)?.imageUrl)}<span className="line-clamp-2 max-w-[320px] text-white">{c.part.name}</span></span></td>
                  <td className="px-3 py-2.5">
                    <OfferPicker offers={options.length ? c.part.offers : []} current={o ?? null} onPick={(k) => onOffer(s, k)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex h-8 items-center rounded-md border border-surface-700">
                      <button type="button" aria-label="Restar" onClick={() => onQty(s, c.qty - 1)} className="h-8 w-7 text-surface-300">−</button>
                      <span className="w-6 text-center font-mono">{c.qty}</span>
                      <button type="button" aria-label="Sumar" onClick={() => onQty(s, c.qty + 1)} className="h-8 w-7 text-surface-300">+</button>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white">{p ? p.label : "—"}</td>
                </tr>
              );
            })}
            {extras.map((e) => {
              const p = price(e.product);
              return (
                <tr key={offerKey(e.product)} className="border-b border-surface-800 last:border-0">
                  <td className="px-3 py-2.5 text-xs font-semibold text-surface-400">Extra</td>
                  <td className="px-3 py-2.5"><span className="flex items-center gap-3">{thumb(e.product.imageUrl)}<span className="line-clamp-2 max-w-[320px] text-white">{e.product.name}</span></span></td>
                  <td className="px-3 py-2.5"><DistName provider={e.product.provider} sub="del catálogo" /></td>
                  <td className="px-3 py-2.5 font-mono">{e.qty}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white">{p ? p.label : "—"}</td>
                </tr>
              );
            })}
            {custom.map((c) => (
              <tr key={c.id} className="border-b border-surface-800 last:border-0">
                <td className="px-3 py-2.5 text-xs font-semibold text-surface-400">Línea libre</td>
                <td className="px-3 py-2.5 text-white">{c.name}</td>
                <td className="px-3 py-2.5 text-xs text-surface-500">Solo en el presupuesto</td>
                <td className="px-3 py-2.5 font-mono">{c.qty}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white">$ {Math.round(c.unitFinalPrice).toLocaleString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </section>
  );
}
