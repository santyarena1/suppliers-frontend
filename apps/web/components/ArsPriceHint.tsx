"use client";

import { usePrefs } from "@/lib/prefs";
import type { FxMarked } from "@/lib/fx";

/**
 * Aviso chico cuando el proveedor cotiza el producto en pesos: en pesos se ve el
 * precio original; en dólares, convertido con el dólar elegido.
 */
export default function ArsPriceHint({ product, className = "" }: { product: FxMarked; className?: string }) {
  const { currency, dollarType, dollarLabel } = usePrefs();
  if (product.fxPending) {
    return (
      <p className={`text-[10px] text-amber-300/90 ${className}`} title="Falta la cotización del dólar para mostrarlo">
        Precio en pesos · sin cotización
      </p>
    );
  }
  if (product.sourceCurrency !== "ARS") return null;
  const title =
    currency === "USD"
      ? `El proveedor lo cotiza en pesos. Acá se ve en dólares con el dólar ${dollarLabel(dollarType)}.`
      : "El proveedor lo cotiza en pesos: es su precio original.";
  return (
    <p className={`text-[10px] text-surface-500 ${className}`} title={title}>
      {currency === "USD" ? "Precio en pesos, convertido" : "Precio en pesos"}
    </p>
  );
}
