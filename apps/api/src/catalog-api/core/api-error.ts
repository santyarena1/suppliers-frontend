import { docsUrl } from "./public-urls";

/**
 * Códigos de error públicos (documentados en nodohub.app/developers#errores).
 * Son un contrato: no se agregan ni se renombran sin actualizar la guía.
 */
export const API_ERROR_CODES = [
  "missing_credentials",
  "invalid_credentials",
  "key_revoked",
  "key_expired",
  "addon_required",
  "subscription_suspended",
  "ip_not_allowed",
  "insufficient_scope",
  "not_found",
  "invalid_parameter",
  "invalid_cursor",
  "cursor_expired",
  "feed_link_required",
  "rate_limited",
  "internal_error",
] as const;

/**
 * Error de la API pública. El filtro de /v1 lo convierte en
 * `{ error: { code, message, requestId, docs } }` con su status.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export const DOCS_URL = docsUrl();

export const Errors = {
  missingCredentials: () =>
    new ApiError(401, "missing_credentials", "Faltan las credenciales. Mandá X-Api-Key y X-Api-Secret, o HTTP Basic (key:secret)."),
  invalidCredentials: () => new ApiError(401, "invalid_credentials", "La key o el secret no son válidos."),
  keyRevoked: () => new ApiError(401, "key_revoked", "Esta API key fue revocada."),
  keyExpired: () => new ApiError(401, "key_expired", "Esta API key está vencida."),
  ipNotAllowed: (ip: string) => new ApiError(403, "ip_not_allowed", `La IP ${ip} no está permitida para esta API key.`),
  scopeRequired: (scope: string) =>
    new ApiError(403, "insufficient_scope", `Esta API key no tiene el permiso «${scope}».`, {}, { requiredScope: scope }),
  tenantInactive: () => new ApiError(401, "invalid_credentials", "La organización de esta API key está dada de baja."),
  addonRequired: () =>
    new ApiError(402, "addon_required", "La API de catálogo no está activa en el plan de esta organización. Se activa desde NODO → Configuración → API de catálogo."),
  subscriptionSuspended: () =>
    new ApiError(402, "subscription_suspended", "La suscripción de esta organización está suspendida. Al regularizar el pago la API vuelve sola."),
  rateLimited: (retryAfter: number) =>
    new ApiError(429, "rate_limited", `Superaste el límite de pedidos por minuto. Reintentá en ${retryAfter} s.`, { "Retry-After": String(retryAfter) }),
  tooManyFailures: (retryAfter: number) =>
    new ApiError(429, "rate_limited", "Demasiados intentos con credenciales inválidas desde esta IP.", { "Retry-After": String(retryAfter) }),
  notFound: (what: string) => new ApiError(404, "not_found", `${what} no existe o no es visible para esta API key.`),
  internal: (status = 500, message = "Error interno. Si se repite, escribinos con el requestId.") => new ApiError(status, "internal_error", message),
  invalidCursor: (message: string) => new ApiError(400, "invalid_cursor", message),
  cursorExpired: () =>
    new ApiError(410, "cursor_expired", "El cursor tiene más de 30 días. Bajá el catálogo completo (/v1/export) y pedí un cursor nuevo (/v1/changes sin cursor)."),
  invalidParameter: (message: string, details?: Record<string, unknown>) => new ApiError(400, "invalid_parameter", message, {}, details),
  fxUnavailable: () =>
    new ApiError(503, "internal_error", "No hay cotización del dólar disponible para convertir a pesos. Reintentá en unos minutos o usá USD.", { "Retry-After": "60" }),
  feedLinkRequired: () =>
    new ApiError(422, "feed_link_required", "Para el feed hace falta configurar el link de cada producto en la key (feed.productUrlTemplate)."),
};
