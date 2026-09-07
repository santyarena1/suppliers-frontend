/**
 * Clave de proveedor de catálogo.
 *
 * Hay dos familias:
 * - los proveedores con integración real (API / portal), listados en
 *   `KNOWN_PROVIDERS`, con adapter en `apps/api/src/providers/adapters`;
 * - los proveedores "por lista", creados desde el panel, cuya clave se genera
 *   con el prefijo `LIST_` (`LIST_ACME`). Su catálogo entra por planillas.
 *
 * Por eso `Provider` es un `string` y no una unión cerrada: la validación real
 * es `isProviderKey`, y la etiqueta se resuelve con `providerLabel`.
 */
export type Provider = string;

export const KNOWN_PROVIDERS = [
  "NEW_BYTES",
  "ELIT",
  "GRUPO_NUCLEO",
  "AIR",
  "NEW_TREE",
  "INVID",
  "GC",
  "POLYTECH",
  "ASHIR",
  "HDC",
  "SOLUTION_BOX",
  "DISTECNA",
  "CEVEN",
  "DIAPSTORE",
] as const;

export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

/** Compatibilidad: la lista de proveedores con integración. Preferir `KNOWN_PROVIDERS`. */
export const ALL_PROVIDERS: Provider[] = [...KNOWN_PROVIDERS];

export const LIST_PROVIDER_PREFIX = "LIST_";
const LIST_PROVIDER_SLUG_MAX = 40;

/** Clave de un proveedor por lista: `LIST_` + slug en mayúsculas. */
export const LIST_PROVIDER_KEY_REGEX = /^LIST_[A-Z0-9]+(?:_[A-Z0-9]+)*$/;

/** Patrón completo de clave válida, para validadores tipo `@Matches`. */
export const PROVIDER_KEY_PATTERN = new RegExp(
  `^(?:${KNOWN_PROVIDERS.join("|")}|LIST_[A-Z0-9]+(?:_[A-Z0-9]+)*)$`
);

export function isKnownProvider(value: unknown): value is KnownProvider {
  return typeof value === "string" && (KNOWN_PROVIDERS as readonly string[]).includes(value);
}

export function isListProviderKey(value: unknown): value is Provider {
  return typeof value === "string" && LIST_PROVIDER_KEY_REGEX.test(value);
}

export function isProviderKey(value: unknown): value is Provider {
  return isKnownProvider(value) || isListProviderKey(value);
}

/**
 * Genera la clave de un proveedor por lista a partir de su nombre comercial:
 * "Acústica Río S.A." → "LIST_ACUSTICA_RIO_S_A". Devuelve `null` si el nombre no
 * deja ningún carácter usable.
 */
export function makeListProviderKey(name: string): string | null {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, LIST_PROVIDER_SLUG_MAX)
    .replace(/_+$/g, "");
  if (!slug) return null;
  return `${LIST_PROVIDER_PREFIX}${slug}`;
}

/** Nombre comercial normalizado de cada proveedor con integración. */
export const PROVIDER_LABELS: Record<string, string> = {
  NEW_BYTES: "New Bytes",
  ELIT: "Elit",
  GRUPO_NUCLEO: "Grupo Núcleo",
  AIR: "Air",
  NEW_TREE: "New Tree",
  INVID: "Invid",
  GC: "GC",
  POLYTECH: "Polytech",
  ASHIR: "Ashir",
  HDC: "HDC",
  SOLUTION_BOX: "Solution Box",
  DISTECNA: "Distecna",
  CEVEN: "Ceven",
  DIAPSTORE: "Diapstore",
};

/**
 * Etiqueta para mostrar de una clave de proveedor. Para los conocidos usa el
 * mapa fijo; para los de lista, el nombre de la organización si se lo pasan, y
 * si no una versión legible de la clave ("LIST_ACME_SRL" → "Acme Srl").
 */
export function providerLabel(key: string, organizationName?: string | null): string {
  const known = PROVIDER_LABELS[key];
  if (known) return known;
  if (organizationName && organizationName.trim()) return organizationName.trim();
  const body = key.startsWith(LIST_PROVIDER_PREFIX) ? key.slice(LIST_PROVIDER_PREFIX.length) : key;
  return body
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface ProductDTO {
  provider: Provider;
  name: string;
  price: string;
  imageUrl: string;
  externalId: string;
  locationAir?: string | null;
}
