import { ManufacturerConnector } from "../types";
import { asusConnector } from "./asus";
import { lenovoConnector } from "./lenovo";
import { hyperxConnector, redragonConnector } from "./shopify";
import { tplinkConnector } from "./tplink";

/**
 * Conectores de webs oficiales que funcionan (probados el 2026-10-09).
 * Sin conector, por bloqueo o búsqueda solo en JavaScript: MSI, Gigabyte y
 * Kingston (403), Samsung (Akamai "Access Denied"), Logitech (búsqueda en JS),
 * LG (404), Corsair (bloqueo parcial), HP (sin probar en esta entrega).
 */
export const MANUFACTURER_CONNECTORS: readonly ManufacturerConnector[] = [
  asusConnector,
  lenovoConnector,
  tplinkConnector,
  hyperxConnector,
  redragonConnector,
];

/**
 * Conector de la marca. Los distribuidores cargan variantes ("LENOVO COMPUTOS",
 * "HyperX Perifericos"): si no hay coincidencia exacta, vale el prefijo.
 */
export function connectorFor(brandKey: string | null): ManufacturerConnector | null {
  if (!brandKey) return null;
  return (
    MANUFACTURER_CONNECTORS.find((c) => c.brandKeys.includes(brandKey)) ??
    MANUFACTURER_CONNECTORS.find((c) => c.brandKeys.some((k) => k.length >= 4 && brandKey.startsWith(k))) ??
    null
  );
}
