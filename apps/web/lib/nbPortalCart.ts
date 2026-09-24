"use client";

/**
 * Lo que estaba cargado en el carrito de la cuenta de New Bytes y no coincide
 * con NODO. Se lee una vez, antes de cotizar: cotizar vacía ese carrito y lo
 * arma con NODO, así que después ya no se puede volver a leer. Por eso queda
 * guardado en la sesión hasta que el comercio decide cada línea.
 */
export type NbPortalLine = {
  code: string;
  name?: string;
  /** Cantidad en el carrito de New Bytes. */
  qty: number;
  /** Cantidad que tenía NODO al leerlo. 0 si no estaba. */
  nodoQty: number;
};

const KEY = "nodo.nbPortalCart";
const EVENT = "nodo:nb-portal-cart";

function read(): NbPortalLine[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((line) => line && typeof line.code === "string") : [];
  } catch {
    return [];
  }
}

function write(lines: NbPortalLine[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event(EVENT));
}

export function readNbPortalLines(): NbPortalLine[] {
  return read();
}

/** Guarda lo que el portal trae distinto de NODO. No pisa lo que ya estaba esperando decisión. */
export function rememberNbPortalCart(
  portal: { code: string; qty: number; name?: string }[],
  nodo: { code: string; qty: number }[]
) {
  const nodoQty = new Map<string, number>();
  for (const line of nodo) nodoQty.set(line.code, (nodoQty.get(line.code) ?? 0) + line.qty);
  const next = new Map(read().map((line) => [line.code, line]));
  for (const line of portal) {
    if (!line.code || !(line.qty > 0)) continue;
    const inNodo = nodoQty.get(line.code) ?? 0;
    if (inNodo === line.qty) continue;
    if (!next.has(line.code)) next.set(line.code, { code: line.code, name: line.name, qty: line.qty, nodoQty: inNodo });
  }
  write([...next.values()]);
}

export function forgetNbPortalLine(code: string) {
  write(read().filter((line) => line.code !== code));
}

/** Después de un pedido, el carrito de New Bytes es el que mandó NODO: no queda nada por decidir. */
export function clearNbPortalLines() {
  write([]);
}

export function subscribeNbPortalLines(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
