import { PROVIDER_LABELS } from "./providers";

/**
 * Errores técnicos ("timeout of 30000ms exceeded", "connect ETIMEDOUT …",
 * "NewBytes GET carrito/… → 503: {…}") pasados a un texto que el comercio
 * entiende: qué pasó, con quién y qué puede hacer. Lo que ya está escrito para
 * el comercio pasa igual. Aplicarlo dos veces no cambia nada.
 */
export interface FriendlyError {
  /** Texto para mostrar. */
  message: string;
  /** El error original, si se tradujo (para soporte). */
  technical: string | null;
}

/** Nombres con que los clientes escriben a cada proveedor ("NewBytes", "NEW_BYTES"). */
function providerAliases(): { re: RegExp; label: string }[] {
  const out: { re: RegExp; label: string }[] = [];
  for (const [key, label] of Object.entries(PROVIDER_LABELS)) {
    const forms = new Set([label, label.replace(/\s+/g, ""), key, label.normalize("NFD").replace(/[̀-ͯ]/g, "")]);
    for (const form of forms) {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out.push({ re: new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, form === key ? "" : "i"), label });
    }
  }
  return out;
}

let aliases: { re: RegExp; label: string }[] | null = null;

/** El proveedor que nombra el mensaje, si nombra uno. */
export function providerInMessage(text: string): string | null {
  aliases ??= providerAliases();
  // "Air" en minúscula es una palabra común: solo cuenta con mayúscula.
  for (const { re, label } of aliases) {
    const m = re.exec(text);
    if (!m) continue;
    if (label === "Air" && !/(^|[^A-Za-z])(Air|AIR)(?![A-Za-z])/.test(text)) continue;
    return label;
  }
  return null;
}

/** Donde empieza lo técnico dentro del mensaje (lo de antes suele ser el contexto: "No se pudo cotizar el envío"). */
const TECHNICAL_START = [
  /\b[A-Za-z][A-Za-z ]{0,20} (GET|POST|PUT|PATCH|DELETE) \S/,
  /\b(GET|POST|PUT|PATCH|DELETE) \/?[a-z0-9_-]+\//i,
  /\bAxiosError\b/,
  /\btimeout of \d+ ?ms exceeded/i,
  /\bRequest failed with status code \d{3}/i,
  /\bUpstream error\b/i,
  /\bconnect E[A-Z]+\b/,
  /\bgetaddrinfo\b/,
  /\bsocket hang up\b/i,
  /\bThe operation was aborted\b/i,
  /\bThis operation was aborted\b/i,
  /\bfetch failed\b/i,
  /\bE(TIMEDOUT|CONNRESET|CONNREFUSED|CONNABORTED|NOTFOUND|HOSTUNREACH|NETUNREACH|AI_AGAIN|PROTO|PIPE)\b/,
  /\bNetwork Error\b/,
  /\b(TypeError|ReferenceError|SyntaxError): /,
  /\bUnexpected token\b/,
  /\bcertificate\b/i,
  /\bstatus(Code)? ?[:=]? ?[45]\d{2}\b/,
  /→ ?\d{3}\b/,
];

const seconds = (ms: number) => (ms >= 1000 ? `${Math.round(ms / 1000)} segundos` : `${ms} ms`);

function httpStatusIn(text: string): number | null {
  const m =
    /status code (\d{3})/i.exec(text) ??
    /→ ?(\d{3})\b/.exec(text) ??
    /\bHTTP ?(\d{3})\b/i.exec(text) ??
    /\bstatus(?:Code)? ?[:=]? ?(\d{3})\b/i.exec(text);
  return m ? Number(m[1]) : null;
}

/** Texto que el proveedor mandó en el cuerpo de un 400/422 ({"message":"Sin stock"}). */
function providerSaid(text: string): string | null {
  const m = /"(?:message|mensaje|error|detail|msg)"\s*:\s*"([^"]{3,200})"/i.exec(text);
  if (!m) return null;
  const said = m[1].trim();
  // Si también es técnico, no aporta.
  return TECHNICAL_START.some((re) => re.test(said)) ? null : said;
}

function reasonFor(technical: string, who: string, whoCap: string): string | null {
  const timeout = /timeout of (\d+) ?ms exceeded/i.exec(technical);
  if (timeout) {
    return `${whoCap} tardó demasiado en responder (más de ${seconds(Number(timeout[1]))}). Suele ser algo momentáneo de su sistema: probá de nuevo en unos minutos.`;
  }
  if (/connect E(TIMEDOUT|CONNREFUSED|HOSTUNREACH|NETUNREACH)/.test(technical)) {
    return `No pudimos conectarnos con ${who}: su sistema no está respondiendo. Probá de nuevo en unos minutos.`;
  }
  if (/ETIMEDOUT|ESOCKETTIMEDOUT|aborted due to timeout|operation was aborted|ECONNABORTED|timed? ?out/i.test(technical)) {
    return `${whoCap} tardó demasiado en responder. Suele ser algo momentáneo de su sistema: probá de nuevo en unos minutos.`;
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(technical)) {
    return `No pudimos encontrar el sistema de ${who}: puede estar caído o haber cambiado de dirección. Probá de nuevo más tarde.`;
  }
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE|socket hang up|fetch failed|Upstream error/i.test(technical)) {
    return `No pudimos conectarnos con ${who}: su sistema no está respondiendo. Probá de nuevo en unos minutos.`;
  }
  if (/certificate|EPROTO|altnames/i.test(technical)) {
    return `El sistema de ${who} tiene un problema de seguridad en su sitio (certificado) y no se pudo conectar. Es de su lado: probá más tarde.`;
  }
  if (/Network Error/.test(technical)) {
    return `No hay conexión con ${who}. Revisá tu internet y probá de nuevo.`;
  }
  const status = httpStatusIn(technical);
  if (status != null) {
    if (status === 401) return `${whoCap} no aceptó el usuario o la clave guardados. Revisalos en la cuenta del proveedor y volvé a probar.`;
    if (status === 403) return `${whoCap} rechazó el acceso (error 403). Puede que haya cambiado tu clave o que tu cuenta no tenga permiso para esto.`;
    if (status === 404) return `${whoCap} no encontró lo que se le pidió (error 404). Puede que el producto o el pedido ya no exista en su sistema.`;
    if (status === 408 || status === 504) return `${whoCap} tardó demasiado en responder. Suele ser algo momentáneo de su sistema: probá de nuevo en unos minutos.`;
    if (status === 429) return `${whoCap} está recibiendo demasiados pedidos y nos pidió esperar. Probá de nuevo en unos minutos.`;
    if (status >= 500) return `${whoCap} tuvo un error en su sistema (error ${status}). Es de su lado: probá de nuevo en unos minutos.`;
    if (status === 400 || status === 422 || status === 409) {
      const said = providerSaid(technical);
      return said ? `${whoCap} respondió: «${said}».` : `${whoCap} no aceptó el pedido (error ${status}). Revisá los datos y volvé a probar.`;
    }
  }
  if (/\b(TypeError|ReferenceError|SyntaxError): |Unexpected token|AxiosError/.test(technical)) {
    return `${whoCap} respondió algo que NODO no pudo leer. Probá de nuevo en unos minutos; si sigue, avisanos.`;
  }
  return null;
}

/**
 * Traduce un error técnico. `provider` es el nombre a usar si el mensaje no
 * nombra uno ("Auto-sync de Elit", el proveedor de la pantalla).
 */
export function friendlyError(raw: string | null | undefined, opts: { provider?: string | null; fallback?: string } = {}): FriendlyError {
  const text = String(raw ?? "").trim();
  if (!text) return { message: opts.fallback ?? "Algo salió mal. Probá de nuevo.", technical: null };

  let start = -1;
  for (const re of TECHNICAL_START) {
    const m = re.exec(text);
    if (m && (start < 0 || m.index < start)) start = m.index;
  }
  if (start < 0) return { message: text, technical: null };

  const provider = providerInMessage(text) ?? (opts.provider?.trim() || null);
  const who = provider ?? "el proveedor";
  const whoCap = provider ?? "El proveedor";
  const reason = reasonFor(text.slice(start), who, whoCap) ?? reasonFor(text, who, whoCap);
  if (!reason) return { message: text, technical: null };

  const context = text
    .slice(0, start)
    .replace(/(\s|:|-|–|—|\.)+$/g, "")
    .replace(/\b(AxiosError|Error)\s*$/i, "")
    .trim();
  // "Auto-sync GRUPO_NUCLEO falló" → con el nombre del proveedor.
  const prettyContext = provider ? context.replace(/\b[A-Z][A-Z0-9]*(_[A-Z0-9]+)+\b|\b[A-Z]{2,}\b/g, (k) => (PROVIDER_LABELS[k] === provider ? provider : k)) : context;
  // "El proveedor…" / "No pudimos…" siguen la frase en minúscula; un nombre propio queda igual.
  const joined = /^(El|La|Un|Una|No)\b/.test(reason) ? `${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : reason;
  const message = prettyContext ? `${prettyContext}: ${joined}` : reason;
  return { message: fixNames(message), technical: text };
}

/** "NewBytes" → "New Bytes" en lo que queda del contexto. */
function fixNames(text: string): string {
  let out = text;
  for (const label of Object.values(PROVIDER_LABELS)) {
    const glued = label.replace(/\s+/g, "");
    if (glued !== label) out = out.replace(new RegExp(`\\b${glued}\\b`, "g"), label);
  }
  return out;
}

/** Solo el texto para mostrar. */
export function friendlyErrorMessage(raw: string | null | undefined, opts: { provider?: string | null; fallback?: string } = {}): string {
  return friendlyError(raw, opts).message;
}
