"use client";

import { useState } from "react";
import { Check, DollarSign, GitCompare, MapPin, Minus, Plus, Sparkles } from "lucide-react";

/**
 * Una vuelta sobre la tarjeta que ya existe. Siempre en claro.
 *
 * Dos reglas nuevas:
 *
 * 1. Una sola moneda, la que el comercio eligió. Eso obliga a repensar dos
 *    cosas que hoy están fijas en dólares: la línea secundaria (que es
 *    justamente la otra moneda, y se va) y "Base US$ ... s/imp", que pasa a la
 *    moneda elegida y absorbe la pastilla de impuesto porque decían lo mismo.
 *
 * 2. Retícula fija: cada dato vive siempre en el mismo renglón, tenga o no
 *    contenido. Lo que un producto no tiene deja el lugar vacío en vez de
 *    correr todo lo de abajo. Así una grilla de veinte tarjetas se lee en
 *    columnas: todos los precios a la misma altura, todos los stocks juntos.
 *    Por eso la marca de imagen automática pasó a ser un sello sobre la foto:
 *    ahí aparece y desaparece sin mover nada.
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
  /** Renglón de aviso: precio en esquema o alícuota faltante. Uno solo. */
  schemeHint?: string;
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

        {/* Sobre la foto, para que aparezca y desaparezca sin correr el resto */}
        {c.imageAiSelected && (
          <span className="pc__ai mono" title="Imagen elegida automáticamente, puede no corresponder">
            <Sparkles size={9} strokeWidth={1.8} />
            IA
          </span>
        )}
      </div>

      {/* Retícula fija: cada fila existe siempre, tenga o no contenido. */}
      <div className="pc__body">
        <h3 className="pc__name">{c.name}</h3>

        <p className="pc__meta">
          {c.brand && <a href="#">{c.brand}</a>}
          {c.brand && c.category ? " · " : ""}
          {c.category && <a href="#">{c.category}</a>}
        </p>

        <p className="pc__price">
          <span className="pc__amount mono">{c.price}</span>
          {c.previousPrice && (
            <span className="pc__prev mono" title="Precio de la sincronización anterior">
              antes <s>{c.previousPrice}</s>
            </span>
          )}
        </p>

        {/* Una sola moneda, un solo renglón: de dónde sale el número de arriba. */}
        <p className="pc__base mono" title={c.breakdownTitle}>
          {c.breakdown}
        </p>

        {/* Renglón de aviso. Vacío si el producto no tiene ninguno. */}
        <p className="pc__aside mono">
          {c.missingIva ? (
            <span className="is-warn">Sin alícuota de IVA</span>
          ) : c.schemeHint ? (
            <span className="is-alt">{c.schemeHint}</span>
          ) : null}
        </p>

        {/* Estado y modalidades, junto al precio que modifican. */}
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
