"use client";

import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { catalogApi } from "@/lib/api";
import { useCart } from "@/lib/cart";
import {
  forgetNbPortalLine,
  readNbPortalLines,
  subscribeNbPortalLines,
  type NbPortalLine,
} from "@/lib/nbPortalCart";

/**
 * «En New Bytes tenías cargado esto». Cada línea se trae a NODO o se descarta.
 * No frena el pedido: el pedido es lo que está en NODO.
 */
export default function NbPortalCartNotice() {
  const { items, add, setQty } = useCart();
  const [lines, setLines] = useState<NbPortalLine[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const refresh = () => setLines(readNbPortalLines());
    refresh();
    return subscribeNbPortalLines(refresh);
  }, []);

  const nodoQty = (code: string) =>
    items
      .filter((it) => it.provider === "NEW_BYTES" && it.externalId === code)
      .reduce((sum, it) => sum + it.qty, 0);

  // Si NODO ya quedó igual al portal (se agregó a mano), no hay nada que decidir.
  const visible = lines.filter((line) => nodoQty(line.code) !== line.qty);

  if (visible.length === 0) return null;

  async function bring(line: NbPortalLine) {
    setBusy(line.code);
    setErrors((prev) => ({ ...prev, [line.code]: "" }));
    try {
      const online = items.find(
        (it) => it.provider === "NEW_BYTES" && it.externalId === line.code && it.channel === "online"
      );
      if (online) {
        const otherLines = nodoQty(line.code) - online.qty;
        setQty(
          { provider: "NEW_BYTES", externalId: line.code, channel: "online", schemeId: null },
          Math.max(line.qty - otherLines, 1)
        );
      } else {
        const { data: product } = await catalogApi.getProduct("NEW_BYTES", line.code);
        if (!product?.externalId) {
          setErrors((prev) => ({ ...prev, [line.code]: "No está en el catálogo de NODO." }));
          return;
        }
        add(product, Math.max(line.qty - nodoQty(line.code), 1), { channel: "online" });
      }
      forgetNbPortalLine(line.code);
    } catch {
      setErrors((prev) => ({ ...prev, [line.code]: "No se pudo agregar a NODO." }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-2.5 text-xs text-surface-300">
      <div className="flex items-start gap-2">
        <ShoppingCart className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-sky-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-surface-200">En New Bytes tenías cargado esto</p>
          <p className="mt-0.5 text-surface-500">
            Elegí qué querés en NODO. El pedido sale con lo que quede en el carrito de NODO.
          </p>
          <ul className="mt-2 space-y-1.5">
            {visible.map((line) => {
              const label = line.name ? `${line.name} (${line.code})` : line.code;
              const inNodo = nodoQty(line.code);
              const isBusy = busy === line.code;
              return (
                <li key={line.code} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 text-surface-200">
                    {label} · {line.qty} u. en New Bytes
                    {inNodo > 0 ? ` · ${inNodo} u. en NODO` : ""}
                  </span>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => bring(line)}
                    className="h-6 px-2 rounded-sm border border-surface-600 text-surface-100 hover:bg-white/10 disabled:opacity-50"
                  >
                    {inNodo > 0 ? `Usar ${line.qty} u.` : "Traer a NODO"}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => forgetNbPortalLine(line.code)}
                    className="h-6 px-2 rounded-sm border border-surface-600 text-surface-100 hover:bg-white/10 disabled:opacity-50"
                  >
                    {inNodo > 0 ? `Dejar ${inNodo} u.` : "No lo quiero"}
                  </button>
                  {errors[line.code] && <span className="text-amber-400/90">{errors[line.code]}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
