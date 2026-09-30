import { marginVsCostPercent, repairImplausibleSalePrice } from "@/lib/retailMatch";

/** WhatsApp del equipo que conecta locales. Móvil de Argentina: 11 4085-9342. */
export const OWN_STORE_WHATSAPP_E164 = "5491140859342";

export interface OwnStoreComparison {
  saleDisplay: number;
  costDisplay: number;
  deltaDisplay: number;
  percent: number;
  saleArs: number;
  costArs: number;
}

/**
 * Diferencia entre el costo final (USD del distribuidor, con la cotización
 * elegida) y el precio de venta en ARS de la web del comercio.
 */
export function compareOwnStorePrice(
  saleArs: number,
  costUsd: number,
  currency: "ARS" | "USD",
  pesoRate: number | null | undefined
): OwnStoreComparison | null {
  if (!(saleArs > 0) || !(costUsd > 0)) return null;
  const rate = pesoRate ?? 0;
  if (!(rate > 0)) return null;
  const costArs = costUsd * rate;
  const sale = repairImplausibleSalePrice(saleArs, costArs);
  const percent = marginVsCostPercent(sale, costArs);
  if (percent == null || !Number.isFinite(percent)) return null;
  if (currency === "USD") {
    const saleUsd = sale / rate;
    return {
      saleDisplay: saleUsd,
      costDisplay: costUsd,
      deltaDisplay: saleUsd - costUsd,
      percent,
      saleArs: sale,
      costArs,
    };
  }
  return {
    saleDisplay: sale,
    costDisplay: costArs,
    deltaDisplay: sale - costArs,
    percent,
    saleArs: sale,
    costArs,
  };
}

export function ownStoreConnectMessage(input: {
  username: string;
  orgName: string;
  email?: string | null;
  storeName: string;
  website?: string;
}): string {
  const who = input.email?.trim()
    ? `${input.username} (${input.email.trim()})`
    : input.username;
  const site = input.website?.trim() || "no lo indiqué";
  return [
    "Hola, te escribo desde NODO.",
    "",
    `Soy ${who} de ${input.orgName}.`,
    "Quiero pedir la conexión gratis de mi tienda web para comparar el costo final de mis distribuidores con el precio de venta de mi local.",
    "",
    "Mi local no está en la lista de tiendas que ya sincronizan.",
    `Nombre del local: ${input.storeName.trim()}`,
    `Sitio web: ${site}`,
  ].join("\n");
}

export function ownStoreWhatsappUrl(message: string): string {
  return `https://wa.me/${OWN_STORE_WHATSAPP_E164}?text=${encodeURIComponent(message)}`;
}
