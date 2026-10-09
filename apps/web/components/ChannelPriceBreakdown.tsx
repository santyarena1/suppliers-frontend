"use client";

import type { TaxLine } from "@/lib/tax";
import { formatARS, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";

type Tone = "amber" | "violet";

const TONES: Record<Tone, { box: string; title: string; total: string; line: string }> = {
  amber: {
    box: "border-amber-500/25 bg-amber-500/[0.06]",
    title: "text-amber-200",
    total: "text-amber-50",
    line: "border-amber-500/20",
  },
  violet: {
    box: "border-violet-500/25 bg-violet-500/[0.06]",
    title: "text-violet-200",
    total: "text-violet-50",
    line: "border-violet-500/20",
  },
};

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className={muted ? "text-surface-400" : "text-surface-300"}>{label}</span>
      <span className={`pp-mono tabular-nums ${muted ? "text-surface-400" : "text-surface-200"}`}>{value}</span>
    </div>
  );
}

function pct(n: number): string {
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

/**
 * Desglose del precio de un canal de compra (pedido offline o esquema): neto,
 * impuestos que quedan, precio final y cuánto cambia contra comprar online.
 */
export default function ChannelPriceBreakdown({
  title,
  tone,
  unitNet,
  lines,
  unitFinal,
  qty,
  onlineUnitFinal,
  note,
}: {
  title: string;
  tone: Tone;
  unitNet: number;
  /** Impuestos a mostrar (el que llama ya filtró según IVA/percepciones elegidos). */
  lines: TaxLine[];
  /** Precio unitario final del canal, con las preferencias de IVA/percepciones aplicadas. */
  unitFinal: number;
  qty: number;
  /** Precio unitario final de la compra online, para comparar. */
  onlineUnitFinal: number;
  note?: string;
}) {
  const { currency, convert } = usePrefs();
  const money = (usd: number) => (currency === "USD" ? formatUSD(usd) : formatARS(convert(usd).amount));
  const t = TONES[tone];
  const taxRows = lines.filter((l) => l.unitAmount > 0.0001);
  const diff = unitFinal - onlineUnitFinal;
  const diffPct = onlineUnitFinal > 0 ? (diff / onlineUnitFinal) * 100 : 0;
  const cheaper = diff < -0.005;

  return (
    <div className={`rounded-xl border ${t.box} p-3.5 flex flex-col gap-1.5`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${t.title}`}>{title}</p>
      <Row label="Costo neto" value={money(unitNet)} />
      {taxRows.map((l) => (
        <Row
          key={`${l.kind}-${l.label}`}
          label={`${l.label}${l.percent != null ? ` ${pct(l.percent)}` : ""}`}
          value={`+ ${money(l.unitAmount)}`}
          muted
        />
      ))}
      <div className={`mt-1 pt-2 border-t ${t.line} flex items-baseline justify-between gap-3`}>
        <span className="text-sm font-medium text-white">Precio unitario</span>
        <span className={`pp-mono tabular-nums text-lg font-semibold ${t.total}`}>{money(unitFinal)}</span>
      </div>
      {qty > 1 && <Row label={`Total × ${qty}`} value={money(unitFinal * qty)} />}
      {Math.abs(diff) > 0.005 && (
        <p className={`text-xs font-medium ${cheaper ? "text-emerald-400" : "text-red-300"}`}>
          {cheaper ? "Ahorrás" : "Pagás"} {money(Math.abs(diff))} por unidad ({cheaper ? "−" : "+"}
          {pct(Math.abs(diffPct))}) contra comprar online
        </p>
      )}
      {note && <p className="text-[11px] leading-snug text-surface-500">{note}</p>}
    </div>
  );
}
