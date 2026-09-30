/**
 * Envío estimado por distribuidor.
 *
 * NODO no cotiza el envío en la búsqueda: el costo real lo da el portal de cada
 * distribuidor recién en el checkout, según dirección y bulto. Lo que sí sabe
 * es cómo suele recibir cada comercio (moto, expreso, retiro…) y cuánto le
 * costó la última vez. Con eso estima, y lo dice como estimación.
 *
 * Dos fuentes:
 * - lo aprendido de los pedidos del comercio (`learnShippingHabits`);
 * - las formas de envío que el comercio carga a mano en la configuración del
 *   distribuidor, con su valor. Sirven para los portales que no informan costo
 *   y para corregir lo aprendido. Si marca una como habitual, esa manda.
 */

export const SHIPPING_CURRENCIES = ["ARS", "USD"] as const;
export type ShippingCurrency = (typeof SHIPPING_CURRENCIES)[number];

/** Cómo se reparte el envío de un pedido entre los productos. */
export const SHIPPING_SPLITS = ["units", "value", "order"] as const;
export type ShippingSplit = (typeof SHIPPING_SPLITS)[number];

export interface ShippingMethod {
  /** Estable y derivado del nombre: cruza con lo aprendido de los pedidos. */
  id: string;
  /** Cómo la llama el comercio o el portal: "Moto", "Expreso", "Retiro". */
  label: string;
  /** Costo del envío de un pedido. 0 = sin costo (retiro). */
  amount: number;
  currency: ShippingCurrency;
  /** La que se usa para estimar, gane lo que gane en los pedidos. Una sola. */
  habitual: boolean;
}

/** Una entrega tal como quedó registrada en un pedido. */
export interface ObservedDelivery {
  label: string;
  pickup: boolean;
  /** Costo informado por el portal, si lo informó. */
  amount: number | null;
  currency: ShippingCurrency | null;
  at: string;
}

export interface LearnedShippingMethod {
  id: string;
  label: string;
  pickup: boolean;
  orders: number;
  /** Último costo conocido de esta forma de envío. */
  lastAmount: number | null;
  currency: ShippingCurrency | null;
  lastAt: string;
}

export interface LearnedShipping {
  /** Pedidos mirados, con o sin entrega reconocible. */
  orders: number;
  methods: LearnedShippingMethod[];
}

export interface ShippingEstimate {
  id: string;
  label: string;
  pickup: boolean;
  /** Costo del pedido. `null` = se conoce la forma pero no cuánto sale. */
  amount: number | null;
  currency: ShippingCurrency | null;
  /** `manual`: la eligió o le cargó el valor el comercio. `history`: salió de sus pedidos. */
  source: "manual" | "history";
  /** Con `history`: en cuántos de los pedidos mirados se usó. */
  orders: number | null;
  ofOrders: number | null;
}

export const MAX_SHIPPING_METHODS = 20;

export function isShippingCurrency(value: unknown): value is ShippingCurrency {
  return value === "ARS" || value === "USD";
}

export function isShippingSplit(value: unknown): value is ShippingSplit {
  return value === "units" || value === "value" || value === "order";
}

export function shippingMethodId(label: string): string {
  return (
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "envio"
  );
}

/**
 * Normaliza lo que venga de la base o del cliente. La columna es JSON: nada se
 * da por bueno sin revisar. Si llegan dos habituales, queda la primera.
 */
export function parseShippingMethods(raw: unknown): ShippingMethod[] {
  if (!Array.isArray(raw)) return [];
  const out: ShippingMethod[] = [];
  const seen = new Set<string>();
  let habitualTaken = false;
  for (const item of raw) {
    const method = parseShippingMethod(item);
    if (!method || seen.has(method.id)) continue;
    seen.add(method.id);
    const habitual = method.habitual && !habitualTaken;
    if (habitual) habitualTaken = true;
    out.push({ ...method, habitual });
    if (out.length >= MAX_SHIPPING_METHODS) break;
  }
  return out;
}

function parseShippingMethod(raw: unknown): ShippingMethod | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const label = typeof rec.label === "string" ? rec.label.trim().slice(0, 60) : "";
  if (!label) return null;
  const amount = Number(rec.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) return null;
  return {
    id: shippingMethodId(label),
    label,
    amount: Math.round(amount * 100) / 100,
    currency: isShippingCurrency(rec.currency) ? rec.currency : "ARS",
    habitual: rec.habitual === true,
  };
}

/**
 * Agrupa las entregas de los pedidos por forma de envío. La más usada queda
 * primera; si empatan, la más reciente. El costo que se recuerda es el último
 * conocido: el envío sube con el tiempo y un promedio viejo engaña.
 */
export function learnShippingHabits(observed: ObservedDelivery[]): LearnedShipping {
  const byId = new Map<string, LearnedShippingMethod>();
  const newestFirst = [...observed].sort((a, b) => b.at.localeCompare(a.at));
  for (const o of newestFirst) {
    const label = o.label.trim();
    if (!label) continue;
    const id = o.pickup ? "retiro" : shippingMethodId(label);
    const known = o.amount != null && Number.isFinite(o.amount) && o.amount >= 0;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, {
        id,
        label: o.pickup ? "Retiro" : label.slice(0, 60),
        pickup: o.pickup,
        orders: 1,
        lastAmount: known ? o.amount : null,
        currency: known ? o.currency : null,
        lastAt: o.at,
      });
      continue;
    }
    const withCost = prev.lastAmount == null && known ? { lastAmount: o.amount, currency: o.currency } : {};
    byId.set(id, { ...prev, ...withCost, orders: prev.orders + 1 });
  }
  const methods = [...byId.values()].sort((a, b) => b.orders - a.orders || b.lastAt.localeCompare(a.lastAt));
  return { orders: observed.length, methods };
}

/**
 * La forma de envío con la que se estima, en este orden:
 * 1. la que el comercio marcó como habitual;
 * 2. la más usada en sus pedidos, con el valor que le cargó a mano si coincide
 *    el nombre, o si no el último costo que informó el portal;
 * 3. sin pedidos, la primera que cargó a mano.
 */
export function resolveShippingEstimate(
  manual: ShippingMethod[],
  learned: LearnedShipping
): ShippingEstimate | null {
  const forced = manual.find((m) => m.habitual);
  if (forced) return fromManual(forced);

  const top = learned.methods[0];
  if (top) {
    const override = manual.find((m) => m.id === top.id);
    if (top.pickup) {
      return { ...fromLearned(top, learned.orders), amount: 0, currency: override?.currency ?? "ARS" };
    }
    if (override) {
      return { ...fromLearned(top, learned.orders), amount: override.amount, currency: override.currency, source: "manual" };
    }
    return fromLearned(top, learned.orders);
  }

  return manual[0] ? fromManual(manual[0]) : null;
}

function fromManual(m: ShippingMethod): ShippingEstimate {
  return {
    id: m.id,
    label: m.label,
    pickup: m.amount === 0 && /retiro|retira|sucursal/i.test(m.label),
    amount: m.amount,
    currency: m.currency,
    source: "manual",
    orders: null,
    ofOrders: null,
  };
}

function fromLearned(m: LearnedShippingMethod, ofOrders: number): ShippingEstimate {
  return {
    id: m.id,
    label: m.label,
    pickup: m.pickup,
    amount: m.lastAmount,
    currency: m.currency,
    source: "history",
    orders: m.orders,
    ofOrders,
  };
}

export interface ShippingShareInput {
  /** Costo del envío del pedido, ya en la moneda de trabajo. */
  cost: number;
  split: ShippingSplit;
  /** Unidades de este distribuidor que ya están en el carrito (incluye este producto). */
  cartUnits: number;
  /** Valor de lo de este distribuidor en el carrito (incluye este producto). */
  cartValue: number;
  /** Unidades de ESTE producto en el carrito. */
  inCartQty: number;
  unitPrice: number;
}

export type ShippingShareBasis = "unit" | "order" | "in_cart";

export interface ShippingShare {
  /** Parte del envío que carga cada unidad de este producto. */
  perUnit: number;
  basis: ShippingShareBasis;
}

/**
 * Cuánto envío le toca a una unidad de este producto.
 *
 * Si el producto todavía no está en el carrito, se calcula como si se sumara
 * una unidad: es lo que el comercio está por decidir. A medida que el carrito
 * de ese distribuidor crece, el envío se reparte entre más.
 *
 * - `units`: el envío dividido por las unidades del pedido.
 * - `value`: cada producto carga envío en proporción a lo que vale.
 * - `order`: el envío es del pedido. El primero que entra lo carga entero; si
 *   ya hay otras cosas de ese distribuidor, este producto no suma envío.
 */
export function shippingShare(input: ShippingShareInput): ShippingShare {
  const cost = Math.max(0, input.cost);
  const inCart = Math.max(0, input.inCartQty);
  const units = Math.max(0, input.cartUnits) + (inCart > 0 ? 0 : 1);
  const price = Math.max(0, input.unitPrice);
  if (cost === 0) return { perUnit: 0, basis: "unit" };

  if (input.split === "order") {
    const others = Math.max(0, input.cartUnits - inCart);
    if (others > 0) return { perUnit: 0, basis: "in_cart" };
    return { perUnit: cost / Math.max(1, inCart), basis: "order" };
  }

  if (input.split === "value") {
    const value = Math.max(0, input.cartValue) + (inCart > 0 ? 0 : price);
    if (value <= 0 || price <= 0) return { perUnit: cost / Math.max(1, units), basis: "unit" };
    return { perUnit: (cost * price) / value, basis: "unit" };
  }

  return { perUnit: cost / Math.max(1, units), basis: "unit" };
}
