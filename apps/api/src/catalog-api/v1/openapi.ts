import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { CATALOG_API_SCOPE_LABELS, CATALOG_API_WEBHOOK_EVENT_LABELS } from "@nodo/shared";
import { DOCS_URL } from "../core/api-error";

const DESCRIPTION = `
API de catálogo de NODO: el catálogo de tu comercio —todos tus distribuidores, con
tus precios, tus impuestos y tu stock— para tu tienda online, tu ERP, tus listas de
precios o tus feeds.

**Siempre al día y sin caídas.** NODO sincroniza tus distribuidores de forma
continua y sirve siempre la última foto buena del catálogo. Si un distribuidor se
cae o responde a medias, la API no: sigue respondiendo con lo último sincronizado y
te avisa la frescura de cada oferta (\`freshness.syncedAt\`, \`freshness.stale\`).

### Autenticación
Cada request lleva tu key y tu secret, de una de estas dos formas:
- Headers \`X-Api-Key: nodo_pk_…\` y \`X-Api-Secret: nodo_sk_…\`
- HTTP Basic: usuario = key, contraseña = secret

El secret se ve una sola vez al crear o rotar la key. Al rotar, el anterior sigue
valiendo 24 h para que cambies sin cortes. Los feeds usan un token de solo lectura
en la URL.

### Paginación
Los listados son por cursor: usá \`pagination.nextCursor\` como \`cursor\` hasta que
\`hasMore\` sea \`false\`. El cursor está atado al orden y a los filtros.

### Límites
Cada key tiene un límite de pedidos por minuto (por defecto 120). Cada respuesta trae
\`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\` y \`X-RateLimit-Reset\`; al pasarte
recibís \`429\` con \`Retry-After\`.

### Errores
\`{ "error": { "code", "message", "requestId", "docs" } }\`. El \`code\` es estable;
el \`requestId\` (también en el header \`X-Request-Id\`) nos sirve para ayudarte.

### Permisos de una key
${Object.entries(CATALOG_API_SCOPE_LABELS)
  .map(([scope, label]) => `- \`${scope}\`: ${label}`)
  .join("\n")}

### Webhooks
NODO te avisa los cambios por POST a tu URL (\`type: "catalog.changes"\`, hasta 100
cambios por entrega), firmados con \`Nodo-Signature: t=<unix>,v1=<hmac>\` donde
\`hmac = HMAC-SHA256("<t>.<body>", signingSecret)\`. Respondé 2xx en menos de 10 s.
Reintentos: 1 min, 5 min, 30 min, 2 h, 6 h, 12 h y 24 h. Eventos:
${Object.entries(CATALOG_API_WEBHOOK_EVENT_LABELS)
  .map(([event, label]) => `- \`${event}\`: ${label}`)
  .join("\n")}

Guía completa con ejemplos: ${DOCS_URL}
`.trim();

/** Documento OpenAPI de /v1: solo los controllers públicos de la API de catálogo. */
export function buildOpenApiDocument(app: INestApplication, modules: unknown[]): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("NODO — API de catálogo")
    .setDescription(DESCRIPTION)
    .setVersion("1.0.0")
    .setContact("NODO", "https://nodohub.app", "")
    .setExternalDoc("Guía y ejemplos", DOCS_URL)
    .addApiKey({ type: "apiKey", in: "header", name: "X-Api-Key", description: "Key pública (nodo_pk_…)" }, "ApiKey")
    .addApiKey({ type: "apiKey", in: "header", name: "X-Api-Secret", description: "Secret (nodo_sk_…)" }, "ApiSecret")
    .addBasicAuth({ type: "http", scheme: "basic", description: "Usuario = key, contraseña = secret" }, "Basic")
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    include: modules as never[],
    operationIdFactory: (_controller, method) => method,
  });
  // Key y secret van juntos (o Basic): las alternativas de seguridad se escriben a mano.
  for (const [path, item] of Object.entries(document.paths)) {
    for (const op of Object.values(item) as { security?: unknown[]; tags?: string[] }[]) {
      if (!op || typeof op !== "object") continue;
      op.security = path.startsWith("/v1/feeds") || path === "/v1/openapi.json" ? [] : [{ ApiKey: [], ApiSecret: [] }, { Basic: [] }];
    }
  }
  return document;
}

/** El documento se arma una vez al arrancar (main.ts) y lo sirve OpenApiController. */
export class OpenApiHolder {
  private static document: OpenAPIObject | null = null;

  static set(document: OpenAPIObject) {
    OpenApiHolder.document = document;
  }

  static get(): OpenAPIObject | null {
    return OpenApiHolder.document;
  }
}
