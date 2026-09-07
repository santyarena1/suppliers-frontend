"use client";

import { useState } from "react";
import { Check, DollarSign, GitCompare, MapPin, Minus, Plus, Sparkles } from "lucide-react";

/**
 * Una vuelta sobre la tarjeta que ya existe. No es un rediseño: es la misma
 * tarjeta hablando el idioma de la landing, siempre en claro.
 *
 * Regla nueva: la tarjeta habla una sola moneda, la que el comercio eligió.
 * Eso obliga a repensar dos cosas que hoy están fijas:
 *  - La línea secundaria de hoy es la OTRA moneda. Se va: si elegiste ARS, no
 *    hay nada en la tarjeta en USD.
 *  - "Base US$ 238,02 · s/imp" estaba siempre en dólares. Pasa a ser un
 *    desglose en la moneda elegida, y absorbe la pastilla de impuesto, que
 *    decía lo mismo con otras palabras.
 *
 * Además el stock, que el DTO ya trae y la tarjeta no mostraba.
 */

export type PassCard = {
  provider: string;
  providerColor: string;
  providerLogo?: string;
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  imageAiSelected?: boolean;
  /** Importe principal, ya formateado en la moneda elegida. */
  price: string;
  /** Precio de la sync anterior, en la misma moneda. */
  previousPrice?: string;
  dropPercent?: number;
  /** Desglose en la misma moneda: base y los impuestos que se estén aplicando. */
  breakdown: string;
  breakdownTitle?: string;
  /** Precio en esquema, en la misma moneda. */
  schemeHint?: string;
  schemeDiscount?: string;
  missingIva?: boolean;
  offline?: "on" | "off" | null;
  scheme?: "on" | "off" | null;
  stock?: number | null;
  stockStatus?: string | null;
  location?: string;
  externalId: string;
  syncedAt: string;
  listOverdue?: string;
};

function stockChip(stock: number | null | undefined, status: string | null | undefined) {
  if (stock == null && !status) return null;
  if (stock == null) return { text: status as string, tone: "plain" as const };
  if (stock <= 0) return { text: "Sin stock", tone: "none" as const };
  return { text: `${stock} u.`, tone: "yes" as const };
}

export default function CardPass({ c }: { c: PassCard }) {
  const [qty, setQty] = useState(0);
  const [compared, setCompared] = useState(false);
  const chip = stockChip(c.stock, c.stockStatus);

  return (
    <article className="pc">
      <div className="pc__shot">
        {c.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.imageUrl} alt={c.name} />
        ) : (
          <span className="pc__noimg mono">Sin imagen</span>
        )}

        {/* Identidad del distribuidor: su propio color, en línea fina, sin tapar */}
        <span className="pc__prov" style={{ ["--pv" as string]: c.providerColor }}>
          {c.providerLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.providerLogo} alt="" />
          ) : (
            <b>{c.provider.slice(0, 2).toUpperCase()}</b>
          )}
          {c.provider}
        </span>

        {/* Lo único que se queda sobre la foto: que el precio bajó, que es noticia */}
        {c.dropPercent != null && c.dropPercent > 0 && (
          <span className="pc__drop mono">
            −{c.dropPercent % 1 === 0 ? c.dropPercent : c.dropPercent.toFixed(1)}%
          </span>
        )}

        {c.location && (
          <span className="pc__loc mono">
            <MapPin size={10} strokeWidth={1.6} />
            {c.location}
          </span>
        )}
      </div>

      {c.imageAiSelected && (
        <p className="pc__ai mono">
          <Sparkles size={9} strokeWidth={1.6} />
          Imagen elegida automáticamente
        </p>
      )}

      <div className="pc__body">
        <h3 className="pc__name">{c.name}</h3>
        {(c.brand || c.category) && (
          <p className="pc__meta">
            {c.brand && <a href="#">{c.brand}</a>}
            {c.brand && c.category ? " · " : ""}
            {c.category && <a href="#">{c.category}</a>}
          </p>
        )}

        <div className="pc__price">
          <span className="pc__amount mono">{c.price}</span>
          {c.previousPrice && <s className="mono">{c.previousPrice}</s>}
        </div>

        {/* Una sola moneda, un solo renglón: de dónde sale el número de arriba. */}
        <p className="pc__base mono" title={c.breakdownTitle}>
          {c.breakdown}
        </p>

        {c.schemeHint && <p className="pc__scheme mono">{c.schemeHint}</p>}
        {c.schemeDiscount && <p className="pc__scheme pc__scheme--dim mono">{c.schemeDiscount}</p>}
        {c.missingIva && <p className="pc__warn mono">Sin alícuota de IVA</p>}

        {/* Estado y modalidades: bajaron de la foto al lugar donde se leen con
            el precio, porque es el precio lo que modifican. */}
        <div className="pc__flags">
          {chip && (
            <span className={`pc__flag pc__flag--${chip.tone} mono`}>
              {chip.tone === "yes" && <Check size={9} strokeWidth={2.4} />}
              {chip.text}
            </span>
          )}
          {c.offline === "on" && <span className="pc__flag pc__flag--on mono">Offline</span>}
          {c.offline === "off" && <span className="pc__flag pc__flag--muted mono">Sin offline</span>}
          {c.scheme === "on" && <span className="pc__flag pc__flag--alt mono">Esquema</span>}
          {c.scheme === "off" && <span className="pc__flag pc__flag--muted mono">Sin esquema</span>}
        </div>

        <div className="pc__foot">
          <span className="pc__id mono" title="Código del distribuidor">
            #{c.externalId}
          </span>

          <div className="pc__acts">
            <button
              type="button"
              className={`pc__ghost${compared ? " is-on" : ""}`}
              title="Agregar al comparador"
              aria-label="Agregar al comparador"
              onClick={() => setCompared((v) => !v)}
            >
              {compared ? <Check size={14} strokeWidth={1.8} /> : <GitCompare size={14} strokeWidth={1.6} />}
            </button>
            <button
              type="button"
              className="pc__ghost"
              title="Ver precios de venta en locales"
              aria-label="Ver precios de venta"
            >
              <DollarSign size={14} strokeWidth={1.6} />
            </button>

            <span className="pc__step">
              <button type="button" onClick={() => setQty((q) => Math.max(0, q - 1))} aria-label="Quitar uno">
                <Minus size={13} strokeWidth={2} />
              </button>
              <b className="mono">{qty}</b>
              <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="Sumar uno">
                <Plus size={13} strokeWidth={2} />
              </button>
            </span>
          </div>
        </div>

        <p className="pc__sync mono">
          {c.syncedAt}
          {c.listOverdue ? ` · ${c.listOverdue}` : ""}
        </p>
      </div>
    </article>
  );
}
