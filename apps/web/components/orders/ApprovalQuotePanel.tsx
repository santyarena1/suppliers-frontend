"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatUSD } from "@/lib/format";
import type { ApprovalQuote } from "@/lib/api";

/** Diferencia de más de un centavo por línea o medio punto en el total: se avisa. */
const TOLERANCE_PCT = 0.5;

/**
 * Precio de hoy del proveedor para un pedido retenido, al lado de lo que se vio
 * cuando se armó. Quien aprueba decide con esto antes de mandarlo.
 */
export function ApprovalQuotePanel({ quote, heldNet }: { quote: ApprovalQuote; heldNet: number }) {
  const now = quote.subtotal;
  const diff = now != null && heldNet > 0 ? now - heldNet : null;
  const pct = diff != null && heldNet > 0 ? (diff / heldNet) * 100 : null;
  const changed = pct != null && Math.abs(pct) >= TOLERANCE_PCT;
  const money = (n: number) => (quote.currency === "USD" ? formatUSD(n) : `${quote.currency} ${n.toFixed(2)}`);

  return (
    <div
      className={`rounded-xl border px-3 py-3 text-xs ${
        quote.problems.length > 0 || changed ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"
      }`}
    >
      <p className="flex items-center gap-1.5 font-semibold text-white">
        {quote.problems.length > 0 || changed ? (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
        )}
        Precio de hoy del proveedor
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 tabular-nums">
        <dt className="text-surface-400">Cuando se armó (neto)</dt>
        <dd className="text-right text-surface-200">{heldNet > 0 ? money(heldNet) : "Sin dato"}</dd>
        <dt className="text-surface-400">Hoy (neto)</dt>
        <dd className="text-right font-semibold text-white">{now != null ? money(now) : "Sin dato"}</dd>
        {quote.total != null && (
          <>
            <dt className="text-surface-400">Hoy con impuestos</dt>
            <dd className="text-right text-surface-200">{money(quote.total)}</dd>
          </>
        )}
      </dl>
      {changed && diff != null && pct != null && (
        <p className="mt-2 text-amber-100">
          {diff > 0 ? "Subió" : "Bajó"} {money(Math.abs(diff))} ({Math.abs(pct).toFixed(1)}%) desde que se armó el pedido.
        </p>
      )}
      {!changed && diff != null && <p className="mt-2 text-emerald-100">Mismo precio que cuando se armó.</p>}
      {quote.problems.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-amber-100">
          {quote.problems.map((p, i) => (
            <li key={`${p.code}-${i}`}>
              {p.code ? `${p.code}: ` : ""}
              {p.message}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-surface-500">
        Cotizado a las {new Date(quote.quotedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}. Al
        aprobar se envía con el precio del proveedor en ese momento.
      </p>
    </div>
  );
}
