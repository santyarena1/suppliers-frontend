"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { isListProvider } from "@/lib/api";
import { canUploadLists, freshnessLabel, useListFreshness } from "@/lib/listFreshness";

const TONE_TEXT = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
  muted: "text-surface-500",
};

/**
 * Leyenda debajo de la fecha de actualización de un producto: "Lista vencida,
 * se sugiere actualizar". Solo para proveedores por lista y para quien puede subir.
 */
export function ListOverdueHint({ provider, className }: { provider: string; className?: string }) {
  const freshness = useListFreshness(isListProvider(provider) ? provider : null);
  if (!freshness || freshness.status !== "OVERDUE" || !canUploadLists()) return null;
  return (
    <Link
      href={`/proveedores/${provider}?tab=lists`}
      className={className ?? "block text-[9px] text-red-400 text-center leading-tight px-1 pb-1 hover:underline"}
      title="La lista de precios de este proveedor superó su cadencia esperada"
    >
      Lista vencida, se sugiere actualizar
    </Link>
  );
}

/** Chip de frescura para la tarjeta del proveedor en el listado. */
export function ListFreshnessChip({ provider }: { provider: string }) {
  const freshness = useListFreshness(isListProvider(provider) ? provider : null);
  if (!freshness) return null;
  const { text, tone } = freshnessLabel(freshness);
  return (
    <span className={`flex items-center gap-1 text-[11px] ${TONE_TEXT[tone]}`}>
      <CalendarClock className="w-3 h-3" /> {text}
    </span>
  );
}
