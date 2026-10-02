"use client";

import { Truck } from "lucide-react";
import {
  freeShippingLabel,
  freeShippingThresholdUsd,
  qualifiesForFreeShipping,
  useShippingEstimates,
} from "@/lib/shipping";

interface FreeShippingCartNoteProps {
  provider: string;
  /** Total del pedido con IVA, sin envío, en USD (el que se compara con el mínimo). */
  orderTotalUsd: number;
  arsPerUsd: number;
  /** El envío lo cotiza el portal del distribuidor: el mínimo cargado es solo referencia. */
  portalQuoted: boolean;
  fmt: (usd: number) => string;
}

/**
 * Debajo del resumen de un distribuidor: cuánto falta para el envío gratis que
 * cargó el comercio, o que ya llegó. Nunca toca el envío que cotiza un portal.
 */
export default function FreeShippingCartNote({ provider, orderTotalUsd, arsPerUsd, portalQuoted, fmt }: FreeShippingCartNoteProps) {
  const free = useShippingEstimates()[provider]?.freeShipping ?? null;
  const limit = freeShippingThresholdUsd(free, arsPerUsd);
  if (!free || limit == null) return null;

  const reached = qualifiesForFreeShipping(orderTotalUsd, free, arsPerUsd);
  const missing = Math.max(0, limit - orderTotalUsd);
  const label = freeShippingLabel(free);

  return (
    <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${reached ? "text-emerald-300" : "text-surface-400"}`}>
      <Truck className="w-3.5 h-3.5 mt-px flex-shrink-0" />
      <span>
        {reached ? (
          <>Envío gratis: el pedido llega a {label} (total con IVA).</>
        ) : (
          <>
            Envío gratis desde {label} (total con IVA): te faltan <b className="tabular-nums">{fmt(missing)}</b>.
          </>
        )}
        {portalQuoted && " El envío de este pedido lo cotiza el distribuidor en su portal: este mínimo es solo una referencia."}
      </span>
    </p>
  );
}
