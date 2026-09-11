export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Texto plano de un valor cualquiera del catálogo.
 *
 * Los proveedores mandan a veces objetos o listas donde uno espera texto (New
 * Bytes manda ATRIBUTOS así). Con un String() pelado eso terminaba impreso como
 * "[object Object]" en la ficha del producto: la cadena no está vacía, así que
 * pasaba el filtro. Acá se aplanan listas y objetos a algo legible, y lo que no
 * se puede leer se descarta en vez de mostrar basura.
 */
export function asString(value: unknown): string | undefined {
  const s = plano(value);
  return s.length > 0 ? s : undefined;
}

function plano(value: unknown, profundidad = 0): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (profundidad >= 2) return "";
  if (Array.isArray(value)) {
    return value.map((v) => plano(v, profundidad + 1)).filter(Boolean).join(" · ");
  }
  if (typeof value === "object") {
    const entradas = Object.entries(value as Record<string, unknown>);
    // Un envoltorio del estilo { type: "plain/text", value: "..." } es el texto
    // que lleva adentro, no una lista de sus campos: sin esto la ficha mostraba
    // "type: plain/text" en vez de la descripción.
    const contenido = entradas.find(([k]) => CLAVES_CONTENIDO.has(k.toLowerCase()));
    if (contenido) return plano(contenido[1], profundidad + 1);
    return entradas
      .filter(([k]) => !CLAVES_METADATO.has(k.toLowerCase()))
      .map(([k, v]) => {
        const texto = plano(v, profundidad + 1);
        return texto ? `${k}: ${texto}` : "";
      })
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

/** Campos que llevan el texto en sí cuando el proveedor lo manda envuelto. */
const CLAVES_CONTENIDO = new Set([
  "value",
  "valor",
  "text",
  "texto",
  "content",
  "contenido",
  "description",
  "descripcion",
  "descripción",
  "detalle",
  "html",
  "body",
]);

/** Campos que describen al dato, no el dato: solos no dicen nada. */
const CLAVES_METADATO = new Set([
  "type",
  "tipo",
  "mime",
  "mimetype",
  "format",
  "formato",
  "encoding",
  "charset",
  "lang",
  "language",
  "idioma",
]);

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function unwrapList<T = unknown>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const rec = asRecord(body);
  if (!rec) return [];
  for (const key of ["data", "items", "results", "resultado", "rows", "orders", "movimientos", "comprobantes"]) {
    const value = rec[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

export type JsonSnapshot =
  | string
  | number
  | boolean
  | JsonSnapshot[]
  | { [key: string]: JsonSnapshot };

/** JSON para columnas Prisma. Nunca null: Prisma pide InputJsonValue, no `null`. */
export function snapshotJson(value: unknown): JsonSnapshot {
  const parsed: unknown = JSON.parse(JSON.stringify(value ?? null));
  if (parsed === null) return {};
  return parsed as JsonSnapshot;
}

export function axiosErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "isAxiosError" in err) {
    const ax = err as { response?: { data?: unknown; status?: number }; message?: string };
    const data = ax.response?.data;
    const fromBody =
      typeof data === "string"
        ? data
        : asString(asRecord(data)?.message) || asString(asRecord(data)?.error_desc) || (data ? JSON.stringify(data) : undefined);
    return (fromBody || ax.message || fallback).slice(0, 400);
  }
  return (err instanceof Error ? err.message : String(err) || fallback).slice(0, 400);
}
