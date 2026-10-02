/**
 * Formas de envío que expone el portal de un distribuidor, para mostrarlas en
 * su configuración y cargarlas como formas de envío propias sin tipearlas.
 *
 * Solo lectura: nunca se toca el carrito del portal ni se arma un pedido. Si el
 * portal solo cotiza con un carrito armado, se informa y no se inventa nada.
 */
export type PortalShippingStatus =
  /** Opciones reales del portal, con costo cuando lo da. */
  | "live"
  /** El portal da los nombres (transportes) pero no el costo. */
  | "names-only"
  /** El portal cotiza el envío recién al confirmar, con el carrito armado. */
  | "at-checkout"
  /** Falta cargar la cuenta del portal. */
  | "no-account"
  /** El portal no respondió. */
  | "error";

export interface PortalShippingOption {
  id: string;
  label: string;
  /** Costo por pedido que informa el portal; `null` si no lo da. */
  amount: number | null;
  currency: "ARS" | "USD" | null;
  /** Plazo o demora, tal como lo informa el portal. */
  plazo: string | null;
  /** Depósito o sucursal desde donde sale, si el portal lo separa. */
  group: string | null;
}

export interface PortalShippingOptions {
  provider: string;
  status: PortalShippingStatus;
  options: PortalShippingOption[];
  note: string;
}

/** Proveedores cuyo portal tiene una lectura de formas de envío sin efectos. */
export const PORTAL_SHIPPING_READERS = ["NEW_BYTES", "ELIT", "POLYTECH"] as const;

export const AT_CHECKOUT_NOTE: Record<string, string> = {
  INVID: "Invid cotiza el envío recién con el carrito armado, al confirmar. Mientras tanto se usa lo que NODO aprende de tus pedidos.",
  SOLUTION_BOX: "Solution Box cotiza el envío al confirmar el pedido.",
  DISTECNA: "Distecna no expone formas de envío: usa las direcciones de tu cuenta y el envío se coordina con el distribuidor.",
  AIR: "Air no expone formas de envío en su portal: se coordinan con el vendedor.",
  NEW_TREE: "New Tree no expone formas de envío: la entrega se coordina con el vendedor.",
  GRUPO_NUCLEO: "Grupo Núcleo no expone formas de envío: el envío se pacta aparte.",
};

export function atCheckout(provider: string): PortalShippingOptions {
  return {
    provider,
    status: "at-checkout",
    options: [],
    note: AT_CHECKOUT_NOTE[provider] ?? "Este distribuidor cotiza el envío al confirmar el pedido.",
  };
}
