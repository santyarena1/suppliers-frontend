import { getUser } from "@/lib/auth";

/**
 * Lo que se eligió en el último pedido a cada distribuidor (vendedor, sucursal,
 * dirección, depósito, pago, entrega…), para proponerlo en el siguiente.
 * Queda en este navegador, por usuario y por distribuidor.
 */
type Choices = Record<string, string>;

const PREFIX = "nodo_checkout_last";

function storageKey(provider: string): string {
  return `${PREFIX}:${getUser()?.id ?? "anon"}:${provider}`;
}

export function lastCheckoutChoices(provider: string): Choices {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(provider)) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string")) as Choices;
  } catch {
    return {};
  }
}

/** Se llama cuando el distribuidor aceptó el pedido. */
export function rememberCheckoutChoices(provider: string, choices: Record<string, string | number | null | undefined>) {
  try {
    const clean: Choices = {};
    for (const [k, v] of Object.entries(choices)) {
      if (v == null) continue;
      clean[k] = String(v);
    }
    localStorage.setItem(storageKey(provider), JSON.stringify(clean));
  } catch {
    // Sin almacenamiento (modo privado): no se recuerda y listo.
  }
}

/**
 * El valor del último pedido si todavía es una opción válida; si no (la
 * dirección se borró, el vendedor ya no está), lo que propone el portal.
 * Sin `options` (texto libre) se usa tal cual.
 */
export function remembered(
  last: Choices,
  field: string,
  fallback: string,
  options?: readonly (string | number)[]
): string {
  const value = last[field];
  if (value === undefined) return fallback;
  if (options && !options.some((o) => String(o) === value)) return fallback;
  return value;
}
