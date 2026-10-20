/**
 * Planilla de Google Sheets como fuente del catálogo de una tienda. El comercio
 * pega el link de compartir ("Cualquier persona con el enlace · Lector") y NODO
 * baja la planilla cada tanto.
 *
 * Seguridad: nunca se pide la URL que pegó el usuario. Se extrae el id de la
 * planilla y el de la pestaña, y NODO arma la dirección de exportación de Google.
 * Las redirecciones solo se siguen a hosts de Google, solo https, con tiempo y
 * tamaño tope. Lo que no sea un CSV (o, para la planilla entera, un xlsx) no entra.
 */

export interface SheetRef {
  sheetId: string;
  gid: string;
}

const SHEET_ID = /^[A-Za-z0-9_-]{25,100}$/;

/**
 * Id de planilla y pestaña desde el link de compartir, o el motivo por el que no
 * sirve. `explicitGid`: el link nombraba una pestaña (si no, `gid` queda en "0").
 */
export function parseSheetUrl(raw: string): (SheetRef & { explicitGid: boolean }) | { error: string } {
  const text = (raw ?? "").trim();
  if (!text) return { error: "Pegá el link de tu planilla de Google" };
  if (text.length > 2000) return { error: "El link es demasiado largo" };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: "Eso no es un link. Copialo desde Compartir → Copiar enlace." };
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
    return { error: "Tiene que ser un link de Google Sheets (docs.google.com/spreadsheets/…)" };
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "spreadsheets" || parts[1] !== "d") {
    return { error: "Tiene que ser un link de Google Sheets (docs.google.com/spreadsheets/…)" };
  }
  if (parts[2] === "e") {
    return { error: "Ese es el link de «Publicar en la Web». Usá el de Compartir → Copiar enlace (cualquier persona con el enlace, lector)." };
  }
  const sheetId = parts[2] ?? "";
  if (!SHEET_ID.test(sheetId)) return { error: "No encontramos el código de la planilla en el link" };
  // La pestaña puede venir en ?gid= o en #gid=. Sin dato, la primera.
  const fromHash = /(?:^|[#&])gid=(\d{1,12})(?:&|$)/.exec(url.hash.replace(/^#/, "#"));
  const linked = url.searchParams.get("gid") ?? fromHash?.[1] ?? null;
  const gid = linked ?? "0";
  if (!/^\d{1,12}$/.test(gid)) return { error: "La pestaña del link no es válida" };
  return { sheetId, gid, explicitGid: linked != null };
}

/** Dirección de exportación a CSV que arma NODO (nunca la que pegó el usuario). */
export function exportUrl(ref: SheetRef): string {
  return `https://docs.google.com/spreadsheets/d/${ref.sheetId}/export?format=csv&gid=${ref.gid}`;
}

/** La planilla entera, con todas sus pestañas, como xlsx (también la arma NODO). */
export function workbookExportUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
}

/** Link "lindo" para mostrarle al dueño y abrir su planilla. */
export function sheetViewUrl(ref: SheetRef): string {
  return `https://docs.google.com/spreadsheets/d/${ref.sheetId}/edit#gid=${ref.gid}`;
}

/** Hosts a los que Google redirige la exportación. Cualquier otro se corta. */
export function isAllowedSheetHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "docs.google.com" || (h.endsWith(".googleusercontent.com") && /^[a-z0-9.-]+$/.test(h));
}

export const SHEET_MAX_BYTES = 5 * 1024 * 1024;
/** La planilla entera trae todas las pestañas: se le da más margen que a una sola. */
export const WORKBOOK_MAX_BYTES = 10 * 1024 * 1024;
const SHEET_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 4;
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export class SheetFetchError extends Error {}

type FetchLike = (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

interface ExportSpec {
  url: string;
  accept: string;
  /** El content-type que tiene que venir; cualquier otro es una página de login o de error. */
  type: string;
  maxBytes: number;
  tooBig: () => SheetFetchError;
  /** Qué decir si Google responde 400. */
  badRequest: string;
}

/** Baja la pestaña como CSV. Tira `SheetFetchError` con un mensaje para el dueño. */
export async function fetchSheetCsv(ref: SheetRef, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Buffer> {
  return fetchGoogleExport(
    {
      url: exportUrl(ref),
      accept: "text/csv",
      type: "text/csv",
      maxBytes: SHEET_MAX_BYTES,
      tooBig: () => new SheetFetchError("La pestaña pesa más de 5 MB. Dejá en esa pestaña solo los productos que publicás."),
      badRequest: "Esa pestaña ya no existe en la planilla. Copiá el link de nuevo desde la pestaña correcta.",
    },
    fetchImpl
  );
}

/**
 * Baja la planilla entera como xlsx, para ver sus pestañas y leer la elegida.
 * Mismas defensas que el CSV; además tiene que empezar como un zip (así es un xlsx).
 */
export async function fetchSheetWorkbook(sheetId: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Buffer> {
  const buf = await fetchGoogleExport(
    {
      url: workbookExportUrl(sheetId),
      accept: XLSX_TYPE,
      type: XLSX_TYPE,
      maxBytes: WORKBOOK_MAX_BYTES,
      tooBig: () => new SheetFetchError("La planilla pesa más de 10 MB. Pasá a otro archivo las pestañas que no son de productos."),
      badRequest: "Google no pudo exportar la planilla. Probamos de nuevo más tarde.",
    },
    fetchImpl
  );
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) throw notPublic();
  return buf;
}

async function fetchGoogleExport(spec: ExportSpec, fetchImpl: FetchLike): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    let current = spec.url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetchImpl(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: spec.accept, "User-Agent": "NODO-sheets-sync/1.0" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new SheetFetchError("Google respondió sin destino. Probá de nuevo en un rato.");
        const next = new URL(location, current);
        // Una planilla privada redirige al login de Google: no es pública.
        if (next.protocol !== "https:" || !isAllowedSheetHost(next.hostname)) throw notPublic();
        current = next.toString();
        continue;
      }
      if (res.status === 404 || res.status === 401 || res.status === 403 || res.status === 410) throw notPublic();
      if (res.status === 400) throw new SheetFetchError(spec.badRequest);
      if (!res.ok) throw new SheetFetchError(`Google no respondió bien (${res.status}). Probamos de nuevo más tarde.`);
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!type.startsWith(spec.type)) throw notPublic();
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > spec.maxBytes) throw spec.tooBig();
      return await readCapped(res, spec.maxBytes, spec.tooBig);
    }
    throw new SheetFetchError("Google redirigió demasiadas veces. Probá de nuevo en un rato.");
  } catch (err) {
    if (err instanceof SheetFetchError) throw err;
    if ((err as { name?: string })?.name === "AbortError") throw new SheetFetchError("Google tardó demasiado en responder. Probamos de nuevo más tarde.");
    throw new SheetFetchError("No pudimos leer la planilla. Probamos de nuevo más tarde.");
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, maxBytes: number, tooBig: () => SheetFetchError): Promise<Buffer> {
  if (!res.body) {
    const all = Buffer.from(await res.arrayBuffer());
    if (all.length > maxBytes) throw tooBig();
    return all;
  }
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooBig();
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function notPublic(): SheetFetchError {
  return new SheetFetchError(
    "No podemos leer la planilla: tiene que estar compartida como «Cualquier persona con el enlace · Lector». Revisá Compartir en Google Sheets."
  );
}
