import { PROVIDER_CREDENTIAL_SCHEMAS } from "@/lib/credentialFields";
import type { Provider } from "@/lib/api";

/**
 * Links hacia afuera de NODO (portal del proveedor, ficha del producto). Solo
 * http(s): un link que vino de una planilla no puede ser `javascript:` ni `data:`.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Portal del proveedor, si lo conocemos (el mismo que se usa al conectar la cuenta). */
export function providerPortal(provider: string): { url: string; label: string } | null {
  const schema = PROVIDER_CREDENTIAL_SCHEMAS[provider as Provider];
  const url = safeHttpUrl(schema?.portalUrl);
  if (!url) return null;
  return { url, label: schema?.portalLabel ?? new URL(url).host.replace(/^www\./, "") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El producto en el portal del proveedor. Primero el link que trajo la sync;
 * si no vino, el que sabemos armar:
 * - Diapstore: la ficha es `/productos/<id>` (el id de api.cumar.com.ar).
 * - HDC (GlobalBluePoint, como New Tree): no hay id del portal en la lista, así
 *   que abre su buscador con el código del fabricante o el nombre; el código
 *   lleva directo a un único resultado.
 * `exact` es false cuando el link es una búsqueda y no la ficha.
 */
export function providerProductLink(
  provider: string,
  product: { productUrl?: string | null; externalId?: string | null; partNumber?: string | null; name?: string | null }
): { url: string; exact: boolean } | null {
  const given = safeHttpUrl(product.productUrl);
  if (given) return { url: given, exact: true };
  const id = product.externalId?.trim() ?? "";
  if (provider === "DIAPSTORE" && UUID.test(id)) {
    return { url: `https://diapstore.com/productos/${id}`, exact: true };
  }
  if (provider === "HDC") {
    // `/`, `;`, `?` y `#` cortan la ruta del portal: van como espacio.
    const q = (product.partNumber || product.name || "").replace(/[/;?#\\]+/g, " ").replace(/\s+/g, " ").trim();
    if (q) return { url: `https://www.hdcsa.com.ar/ARTICULOS/BUS=${encodeURIComponent(q)}/hdcsa.aspx`, exact: false };
  }
  return null;
}
