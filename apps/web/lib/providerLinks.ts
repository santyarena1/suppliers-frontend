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
