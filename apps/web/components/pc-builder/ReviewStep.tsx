"use client";

import { ImageOff } from "lucide-react";
import type { ProductDTO } from "@/lib/api";
import { proxyImg } from "@/lib/format";
import ProviderBadge, { providerLabel } from "@/components/ProviderBadge";
import { STEP_LABEL, byLevel, checks, type Build, type PcStep } from "@/lib/pc-builder/compat";
import { PART_STEPS, inStock, offerKey, useOfferPricer, type ChosenPart, type CustomLine, type ExtraLine } from "@/lib/pc-builder/state";

const DOT = { ok: "bg-emerald-400", warn: "bg-amber-400", bad: "bg-red-400" } as const;

/** Revisión final: todas las líneas, de qué distribuidor sale cada una y los chequeos. */
export default function ReviewStep({
  build, parts, offers, extras, custom, onOffer, onQty, onGo,
}: {
  build: Build;
  parts: Partial<Record<PcStep, ChosenPart>>;
  offers: Partial<Record<PcStep, ProductDTO | null>>;
  extras: ExtraLine[];
  custom: CustomLine[];
  onOffer: (step: PcStep, key: string) => void;
  onQty: (step: PcStep, qty: number) => void;
  onGo: (step: PcStep) => void;
}) {
  const price = useOfferPricer();
  const cs = checks(build).sort(byLevel);
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
        <p className="mt-1 text-sm text-surface-400">Elegí de qué distribuidor sale cada pieza y la cantidad. Después creá el presupuesto o pasalo al carrito.</p>
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
                    {options.length > 1 ? (
                      <label className="flex flex-col gap-1">
                        <span className="sr-only">Distribuidor de {STEP_LABEL[s]}</span>
                        {o && <ProviderBadge provider={o.provider} variant="inline" size="sm" />}
                        <select value={o ? offerKey(o) : ""} onChange={(e) => onOffer(s, e.target.value)} className="h-8 max-w-[200px] rounded-md border border-surface-700 bg-surface-950 px-2 text-xs text-surface-200">
                          {options.map((x) => <option key={offerKey(x)} value={offerKey(x)}>{providerLabel(x.provider)} · {price(x)!.label}</option>)}
                        </select>
                      </label>
                    ) : o ? <ProviderBadge provider={o.provider} variant="inline" size="sm" /> : <span className="text-xs text-amber-300">Sin stock</span>}
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
                  <td className="px-3 py-2.5"><ProviderBadge provider={e.product.provider} variant="inline" size="sm" /></td>
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

      <div className="rounded-xl border border-surface-800">
        <h3 className="border-b border-surface-800 px-4 py-2.5 text-sm font-semibold text-white">Chequeos de compatibilidad</h3>
        {cs.length ? (
          <ul className="m-0 list-none p-0">
            {cs.map((c, i) => (
              <li key={i} className="flex items-start gap-2.5 border-b border-surface-800/70 px-4 py-2 text-sm last:border-0">
                <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${DOT[c.level]}`} />
                <span><span className="font-medium text-white">{c.name}</span> <span className="text-surface-300">· {c.text}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="px-4 py-3 text-sm text-surface-400">Elegí piezas para ver los chequeos.</p>}
        <p className="border-t border-surface-800 px-4 py-2 text-xs text-surface-500">Se chequea con la ficha técnica de cada producto. Si falta un dato se marca para verificar, nunca se da por bueno.</p>
      </div>
    </section>
  );
}
