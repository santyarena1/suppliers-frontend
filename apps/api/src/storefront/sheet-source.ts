/**
 * Planilla de Google Sheets como fuente del catálogo de una tienda. El comercio
 * pega el link de compartir ("Cualquier persona con el enlace · Lector") y NODO
 * baja la hoja como CSV cada tanto.
 *
 * Seguridad: nunca se pide la URL que pegó el usuario. Se extrae el id de la
 * planilla y el de la pestaña, y NODO arma la dirección de exportación de Google.
 * Las redirecciones solo se siguen a hosts de Google, solo https, con tiempo y
 * tamaño tope. Lo que no sea un CSV no entra.
 */

export interface SheetRef {
  sheetId: string;
  gid: string;
}

const SHEET_ID = /^[A-Za-z0-9_-]{25,100}$/;

/** Id de planilla y pestaña desde el link de compartir, o el motivo por el que no sirve. */
export function parseSheetUrl(raw: string): SheetRef | { error: string } {
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
  const gid = url.searchParams.get("gid") ?? fromHash?.[1] ?? "0";
  if (!/^\d{1,12}$/.test(gid)) return { error: "La pestaña del link no es válida" };
  return { sheetId, gid };
}

/** Dirección de exportación a CSV que arma NODO (nunca la que pegó el usuario). */
export function exportUrl(ref: SheetRef): string {
  return `https://docs.google.com/spreadsheets/d/${ref.sheetId}/export?format=csv&gid=${ref.gid}`;
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
const SHEET_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 4;

export class SheetFetchError extends Error {}

type FetchLike = (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

/** Baja la pestaña como CSV. Tira `SheetFetchError` con un mensaje para el dueño. */
export async function fetchSheetCsv(ref: SheetRef, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    let current = exportUrl(ref);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetchImpl(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/csv", "User-Agent": "NODO-sheets-sync/1.0" },
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
      if (res.status === 400) throw new SheetFetchError("Esa pestaña ya no existe en la planilla. Copiá el link de nuevo desde la pestaña correcta.");
      if (!res.ok) throw new SheetFetchError(`Google no respondió bien (${res.status}). Probamos de nuevo más tarde.`);
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!type.startsWith("text/csv")) throw notPublic();
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > SHEET_MAX_BYTES) throw tooBig();
      return await readCapped(res);
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

async function readCapped(res: Response): Promise<Buffer> {
  if (!res.body) return Buffer.from(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > SHEET_MAX_BYTES) {
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

function tooBig(): SheetFetchError {
  return new SheetFetchError("La pestaña pesa más de 5 MB. Dejá en esa pestaña solo los productos que publicás.");
}
