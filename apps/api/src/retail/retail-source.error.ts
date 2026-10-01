/**
 * Errores de la fuente principal de locales (PrecioLíder).
 *
 * El dominio `api.preciolider.com.ar` a veces apunta a un load balancer ajeno
 * (certificado de mlsgrid.com, HTTP 503). Eso no es un bug de Nodo: la fuente
 * está caída. El ingest tiene que reconocerlo y no tumbar toda la corrida.
 */

const UNAVAILABLE_CODES = new Set([
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "EPROTO",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "ESOCKETTIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

const UNAVAILABLE_STATUS = new Set([502, 503, 504]);

export class RetailSourceUnavailableError extends Error {
  readonly unavailable = true as const;

  constructor(message: string) {
    super(message);
    this.name = "RetailSourceUnavailableError";
  }
}

export function isRetailSourceUnavailable(err: unknown): boolean {
  if (err instanceof RetailSourceUnavailableError) return true;
  return describeRetailSourceError(err).unavailable;
}

export function describeRetailSourceError(err: unknown): { unavailable: boolean; message: string } {
  if (err instanceof RetailSourceUnavailableError) {
    return { unavailable: true, message: err.message };
  }

  const code = errorCode(err);
  const status = httpStatus(err);
  const raw = err instanceof Error ? err.message : String(err ?? "error desconocido");

  if (code && UNAVAILABLE_CODES.has(code)) {
    return { unavailable: true, message: friendlyUnavailable(raw, code, status) };
  }
  if (status != null && UNAVAILABLE_STATUS.has(status)) {
    return { unavailable: true, message: friendlyUnavailable(raw, code, status) };
  }
  if (/Hostname\/IP does not match certificate/i.test(raw) || /altnames/i.test(raw)) {
    return { unavailable: true, message: friendlyUnavailable(raw, code, status) };
  }
  if (/certificate/i.test(raw) && /fail|mismatch|self.signed|expired/i.test(raw)) {
    return { unavailable: true, message: friendlyUnavailable(raw, code, status) };
  }

  return { unavailable: false, message: raw };
}

function friendlyUnavailable(raw: string, code: string | null, status: number | null): string {
  if (/mlsgrid/i.test(raw) || /Hostname\/IP does not match certificate/i.test(raw)) {
    return (
      "PrecioLíder (api.preciolider.com.ar) está caída: el dominio apunta a un servidor " +
      "ajeno (certificado de mlsgrid.com) y no entrega el catálogo. Los precios ya " +
      "cargados se siguen mostrando. HardGamers y Compra Gamer siguen sincronizando."
    );
  }
  if (status === 503) {
    return (
      "PrecioLíder no está disponible (HTTP 503). Los precios ya cargados se siguen " +
      "mostrando. HardGamers y Compra Gamer siguen sincronizando."
    );
  }
  const hint = [code, status != null ? `HTTP ${status}` : null].filter(Boolean).join(" · ");
  return (
    "PrecioLíder no responde" +
    (hint ? ` (${hint})` : "") +
    ". Los precios ya cargados se siguen mostrando. HardGamers y Compra Gamer siguen sincronizando."
  );
}

function errorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const rec = err as { code?: unknown; cause?: { code?: unknown } };
  if (typeof rec.code === "string") return rec.code;
  if (typeof rec.cause?.code === "string") return rec.cause.code;
  return null;
}

function httpStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const rec = err as { response?: { status?: unknown }; status?: unknown };
  if (typeof rec.response?.status === "number") return rec.response.status;
  if (typeof rec.status === "number") return rec.status;
  return null;
}
