"use client";

import { providerLabel } from "@/components/ProviderBadge";
import { findLastPurchase, formatPurchaseDate, useLastPurchaseIndex } from "@/lib/last-purchases";

/** «Comprado 10 ene 2026 · 2 u.» en la tarjeta del buscador. Nada si nunca se compró. */
export default function LastPurchaseHint({
  product,
  className,
}: {
  product: { provider: string; externalId: string; name?: string | null };
  className?: string;
}) {
  const index = useLastPurchaseIndex();
  const last = findLastPurchase(index, product);
  if (!last) return null;
  const date = formatPurchaseDate(last.at);
  const where = last.sameProvider ? "" : ` en ${providerLabel(last.provider)}`;
  return (
    <p
      className={className ?? "text-[10px] text-sky-300"}
      title={`Última compra: ${date}${where} · ${last.qty} u. · ${last.name}`}
    >
      Comprado {date}
      {where} · {last.qty} u.
    </p>
  );
}
