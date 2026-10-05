# API de catálogo de NODO — diseño

Módulo que expone el catálogo de un comercio (Tipo 1) a sus propios sistemas:
tienda online, ERP, listas de precios, feeds de Google/Meta. Se autentica con
API key + secret, se configura por key y está documentado con OpenAPI.

- **Precio**: módulo extra de **US$ 10/mes** en Base y Pro. **Incluido en Custom.**
- **Diferencial**: NODO sincroniza seguido y sirve siempre la última foto buena
  del catálogo. Si un distribuidor se cae, la API no se cae ni devuelve datos a
  medias: sigue respondiendo con lo último sincronizado y avisa la frescura de
  cada oferta (`syncedAt`, `stale`).

Decisiones del dueño del producto (2026-10-05):

| Tema | Decisión |
|---|---|
| Precio expuesto | Todo (costo, impuestos, precio con margen), configurable por key |
| Agrupación | Dos vistas: por oferta y agrupado por producto; la key elige la de defecto |
| Distribuidor | Configurable por key; por defecto **oculto** (alias estable) |
| Alcance v1 | Todo: lectura completa, cambios incrementales, webhooks, export CSV/XLSX/JSON, feeds Google/Meta, toda la info del producto |

---

## 1. Habilitación y facturación

- Capacidad nueva `catalogApi` en `packages/shared/src/plans.ts`.
  - **Custom**: siempre.
  - **Base/Pro**: solo con el módulo activo.
- `Subscription.catalogApiAddon Boolean @default(false)` + `catalogApiAddonSince DateTime?`.
- `CATALOG_API_ADDON_PRICE_USD = 10` en shared. El monto mensual del comercio
  pasa a ser plan + módulos activos (Custom no suma). Se muestra en Plan y facturación.
- El dueño lo activa desde **Configuración → API de catálogo** (o desde Plan y
  facturación). Queda registrado en `SubscriptionEvent` (`ADDON_ENABLED` /
  `ADDON_DISABLED`) y avisa a la bandeja de Administración. Superadmin lo prende
  o apaga desde el detalle de la suscripción.
- Sin el módulo (o con la suscripción suspendida) las keys responden
  `402 addon_required` / `402 subscription_suspended`; no se borran.

## 2. Modelo de datos (Prisma)

```prisma
model ApiClient {            // una "key"
  id            String   @id @default(uuid())
  tenantId      String
  name          String                  // "Tienda online", "ERP"
  publicKey     String   @unique        // nodo_pk_<24 base62>
  secretHash    String                  // HMAC-SHA256(secret, API_KEY_PEPPER) hex
  secretLast4   String
  /// Al rotar, el secret anterior sigue valiendo 24 h.
  previousSecretHash      String?
  previousSecretExpiresAt DateTime?
  /// Token de solo lectura para feeds (Google/Meta no mandan headers).
  feedToken     String   @unique        // nodo_ft_<32 base62>
  status        ApiClientStatus @default(ACTIVE)  // ACTIVE | REVOKED
  config        Json                    // ApiClientConfig (ver §4), validado
  scopes        String[]                // catalog:read, changes:read, export:read, feeds:read, webhooks:manage
  ipAllowlist   String[]                // vacío = cualquiera; IPs o CIDR
  rateLimitPerMinute Int  @default(120)
  lastUsedAt    DateTime?
  lastUsedIp    String?
  expiresAt     DateTime?
  createdById   String
  createdAt     DateTime @default(now())
  revokedAt     DateTime?
  webhooks      ApiWebhookEndpoint[]
  usage         ApiUsageDaily[]
  @@index([tenantId, status])
}

model ApiUsageDaily {
  apiClientId String
  day         DateTime @db.Date
  requests    Int @default(0)
  errors      Int @default(0)
  @@id([apiClientId, day])
}

model ApiWebhookEndpoint {
  id              String   @id @default(uuid())
  apiClientId     String
  url             String                // https obligatorio (http solo localhost en dev)
  secretEncrypted String                // whsec_… cifrado con CryptoService
  events          String[]              // ver §7
  active          Boolean  @default(true)
  /// Hasta dónde se avisó: cursor del feed de cambios (§6).
  cursor          String?
  consecutiveFailures Int @default(0)
  disabledAt      DateTime?             // se apaga solo tras 20 fallos seguidos
  disabledReason  String?
  createdAt       DateTime @default(now())
  deliveries      ApiWebhookDelivery[]
}

model ApiWebhookDelivery {
  id           String   @id @default(uuid())
  endpointId   String
  eventId      String                   // evt_… idempotencia del lado del cliente
  type         String
  payload      Json
  status       String                   // PENDING | DELIVERED | FAILED
  attempts     Int @default(0)
  nextAttemptAt DateTime?
  lastStatusCode Int?
  lastError    String?
  deliveredAt  DateTime?
  createdAt    DateTime @default(now())
  @@index([endpointId, createdAt])
  @@index([status, nextAttemptAt])
}
```

Retención: entregas 30 días, uso diario 13 meses (cron de limpieza 04:30).

## 3. Autenticación

- Dos formas equivalentes (para integrarse con cualquier herramienta):
  1. Headers `X-Api-Key: nodo_pk_…` y `X-Api-Secret: nodo_sk_…`.
  2. HTTP Basic: usuario = key, contraseña = secret.
- El secret se muestra **una sola vez** al crear o rotar. Se guarda
  `HMAC-SHA256(secret, API_KEY_PEPPER)` y se compara en tiempo constante.
  `API_KEY_PEPPER` es variable de entorno obligatoria (falla al arrancar si falta).
- Rotar: genera secret nuevo; el anterior sigue valiendo 24 h (`previousSecretHash`,
  `previousSecretExpiresAt`) para cortar sin caídas.
- Guard `ApiKeyGuard` (no usa el JWT global: los controllers `/v1` son `@Public()`
  y aplican su propio guard), que resuelve `ApiPrincipal { client, tenantId, config }`:
  key activa, no vencida, IP permitida, scope requerido, módulo habilitado,
  suscripción no suspendida, organización activa.
- Rate limit por key (ventana de 60 s, en memoria) con headers
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; `429` con
  `Retry-After`. Además el throttler global por IP sigue activo.
- Uso: `lastUsedAt`/`lastUsedIp` (como mucho cada 60 s) y `ApiUsageDaily` (upsert).
- Feeds: `GET /v1/feeds/{feedToken}/google.xml` y `/meta.csv` (solo scope `feeds:read`).

## 4. Configuración por key (`ApiClientConfig`)

```ts
{
  defaultView: "offers" | "products",          // default "products"
  providers: { mode: "all" | "only"; keys: string[] },   // qué distribuidores entran
  providerIdentity: "hidden" | "visible",      // default "hidden": alias "Proveedor N" + id estable
  includeOutOfStock: boolean,                  // default false
  minStock: number,                            // default 0 (además del umbral por distribuidor)
  price: {
    includeCost: boolean,                      // default true: costo neto del distribuidor
    includeTaxes: boolean,                     // default true: IVA, internos, percepciones
    includeSalePrice: boolean,                 // default true: precio con margen
    markup: { mode: "provider" | "fixed"; percent?: number },  // provider = el margen que ya usa en NODO
    rounding: "none" | "0.01" | "1" | "10" | "99",           // "99" = termina en ,99
    currency: "USD" | "ARS",
    fxRate: "oficial" | "blue" | "mep" | "tarjeta" | "fixed", fxFixed?: number,
  },
  fields: { raw: boolean; priceHistory: boolean },  // raw = datos crudos del distribuidor (default false)
}
```

Validación con class-validator en un DTO; los defaults se completan al leer, así
una key vieja nunca rompe.

## 5. Recursos y endpoints (`/v1`)

Formato propio (sin el envelope interno `{success,data}`):

```json
{ "data": [...], "pagination": { "nextCursor": "…", "hasMore": true, "limit": 100 },
  "meta": { "currency": "USD", "fx": { "source": "oficial", "rate": 1450.5, "at": "…" }, "generatedAt": "…" } }
```

Errores: `{ "error": { "code": "invalid_cursor", "message": "…", "requestId": "req_…", "docs": "https://nodohub.app/developers#errores" } }`.
Todas las respuestas llevan `X-Request-Id`.

| Método | Ruta | Scope | Qué devuelve |
|---|---|---|---|
| GET | `/v1/me` | — | Key (nombre, scopes, config efectiva, límites), comercio, estado del módulo |
| GET | `/v1/products` | catalog:read | Vista agrupada. Filtros: `q`, `brand`, `category`, `subcategory`, `provider`, `inStock`, `minPrice`, `maxPrice`, `updatedSince`, `ean`, `partNumber`; `sort` = `relevance|name|price|-price|updatedAt|-updatedAt`; `limit` ≤ 500; `cursor` |
| GET | `/v1/products/{productId}` | catalog:read | Un producto con todas sus ofertas |
| GET | `/v1/offers` | catalog:read | Vista por oferta, mismos filtros |
| GET | `/v1/offers/{offerId}` | catalog:read | Una oferta |
| GET | `/v1/offers/{offerId}/price-history` | catalog:read | Cambios de precio (12 meses) |
| GET | `/v1/changes` | changes:read | Feed incremental (§6) |
| GET | `/v1/brands` · `/v1/categories` | catalog:read | Taxonomía canónica (árbol de categorías) con conteos |
| GET | `/v1/providers` | catalog:read | Distribuidores de la key (alias si oculto), estado y frescura de su sync |
| GET | `/v1/fx` | — | Cotizaciones disponibles y la que usa la key |
| GET | `/v1/export?format=csv\|xlsx\|json&view=…` | export:read | Catálogo completo con la config de la key (stream) |
| GET | `/v1/feeds/{feedToken}/google.xml` · `/meta.csv` | feeds:read | Feeds de producto |
| GET/POST/PATCH/DELETE | `/v1/webhooks…` | webhooks:manage | Alta/baja de webhooks por API; `POST /v1/webhooks/{id}/test` |
| GET | `/v1/openapi.json` | público | OpenAPI 3.0 |

### Imágenes

`images` trae la foto principal y toda la galería del distribuidor (hasta 20): Grupo Núcleo `url_imagenes`, Distecna y Polytech `images`, Ceven `itemimages_detail.urls` (ver `core/gallery.ts`). Las URLs con espacios se codifican. El feed de Google suma hasta 10 `additional_image_link` y el de Meta la columna `additional_image_link`. En la vista por oferta, `product.images` trae lo mismo.

### Ids estables

- `offerId` = `off_` + base62(sha256(`provider:externalId`))[:22] — no expone el distribuidor.
- `productId` = `prd_` + hash de la clave de agrupación:
  1. EAN normalizado (8/12/13/14 dígitos, check digit válido), si no
  2. `marcaCanónica:partNumber` normalizado (mayúsculas, sin espacios/guiones), si no
  3. el `offerId` (producto de una sola oferta).
- Alias de distribuidor oculto: `prv_` + hash(tenantId + provider), con nombre
  "Proveedor N" según orden estable por antigüedad del vínculo.

### Producto (vista agrupada)

```json
{
  "id": "prd_…", "name": "…", "brand": {"id":"…","name":"ASUS"},
  "category": {"id":"…","name":"Placas de video","path":["Componentes","Placas de video"]},
  "subcategory": {...}, "ean": "…", "partNumber": "…", "sku": "…",
  "description": "…", "longDescription": "…",
  "images": [{"url":"…","source":"provider|ai_suggested"}],
  "specs": {"warranty":"…","weight":{"value":1.2,"unit":"kg"},"dimensions":{"height":…,"width":…,"length":…,"unit":"cm"},"volume":…},
  "tags": [...],
  "availability": {"inStock": true, "totalStock": 34, "offers": 3},
  "bestOffer": { ...oferta },
  "offers": [ ...ofertas ],
  "priceRange": {"min": …, "max": …},
  "updatedAt": "…"
}
```

### Oferta

```json
{
  "id": "off_…", "productId": "prd_…",
  "provider": {"id":"prv_…","name":"Proveedor 2"},          // o el nombre real si es visible
  "sku": "…", "externalId": "…",                             // externalId solo si identity=visible
  "stock": {"quantity": 12, "status": "in_stock|low|out_of_stock", "minThresholdApplied": 2},
  "price": {
    "currency": "USD",
    "cost": {"net": 100.0, "taxes": [{"type":"iva","label":"IVA","percent":10.5,"amount":10.5},
                                      {"type":"internal","label":"Imp. internos",...},
                                      {"type":"perception","label":"Percepción IIBB",...}],
             "gross": 115.2},
    "sale": {"net": 120.0, "gross": 138.2, "markupPercent": 20},
    "listSource": "api|list|base_list"
  },
  "freshness": {"syncedAt": "…", "stale": false, "providerSync": "ok|paused|error"},
  "raw": {...}            // solo con fields.raw
}
```

Los impuestos se calculan con la misma lógica que la web: `extractTaxLines` y
`linePricing` se mueven a `packages/shared` (la web importa de ahí) para que la API
y la pantalla nunca difieran.

### Cotización

`FxService` en la API: `https://dolarapi.com/v1/dolares` con caché de 10 min y
última cotización buena guardada (si el servicio externo se cae, se usa la última
y `meta.fx.stale = true`).

## 6. Cambios incrementales

- Cursor opaco = base64url(`updatedAt|offerId interno`) sobre
  `TenantProductOffer.updatedAt` (orden `updatedAt, id`), más los cambios de ficha
  (`ProviderSyncCache.syncedAt`) de esas ofertas.
- Cada item: `{ "type": "offer.created|offer.updated|offer.removed", "offer": {...} | {"id":…}, "productId": "…", "at": "…" }`.
  `removed` = oferta inactiva, sin stock (si la key no incluye sin stock) o
  distribuidor excluido/desconectado.
- `GET /v1/changes` sin cursor devuelve el cursor actual (para arrancar después de
  un export completo). Cursores de más de 30 días → `410 cursor_expired` (hacer export).

## 7. Webhooks

- Eventos: `offer.created`, `offer.updated`, `offer.removed`, `price.changed`,
  `stock.changed`, `provider.sync_paused`, `provider.sync_resumed`, `ping`.
- Despachador cada minuto: por endpoint activo, lee el feed de cambios desde su
  `cursor`, arma lotes de hasta 100 items (`type: "catalog.changes"` con
  `data.items[]`) y los encola; avanza el cursor solo al encolar.
- Firma estilo Stripe: header `Nodo-Signature: t=<unix>,v1=<hex hmac-sha256("t.body", whsec)>`,
  más `Nodo-Event-Id`, `Nodo-Event-Type`. Tolerancia sugerida 5 min.
- Reintentos con backoff: 1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h (7 intentos);
  2xx = entregado. 20 fallos seguidos → endpoint deshabilitado y aviso al dueño.
- Timeout 10 s, solo `https` (salvo localhost fuera de producción), sin seguir
  redirecciones, bloqueo de IPs privadas/locales (SSRF).

## 8. Export y feeds

- Export: stream, mismo filtro/config. CSV (UTF-8 con BOM, `;` opcional por
  `delimiter`), JSON (array en stream) y XLSX (librería `xlsx` existente; tope
  100.000 filas).
- Google Merchant (RSS 2.0 `g:`): `id`, `title`, `description`, `link` (config
  `feed.productUrlTemplate`), `image_link`, `availability`, `price` (precio de
  venta con impuestos, en la moneda de la key), `brand`, `gtin`, `mpn`,
  `condition=new`, `product_type`.
- Meta (CSV de catálogo): `id,title,description,availability,condition,price,link,image_link,brand,gtin,mpn`.
- Si no hay `productUrlTemplate`, el feed responde `422 feed_link_required`.

## 9. Documentación

- `@nestjs/swagger` solo sobre los controllers `/v1` → `GET /v1/openapi.json`.
- Página pública **nodohub.app/developers**: guía (inicio rápido, autenticación,
  paginación, filtros, precios e impuestos, monedas, frescura, errores, límites,
  cambios incrementales, webhooks con verificación de firma en Node, Python y
  PHP, feeds, buenas prácticas) + referencia interactiva generada del OpenAPI.
- Ejemplos en curl, JavaScript, Python y PHP.

## 10. Pantallas

- **Configuración → API de catálogo** (dueño o permiso `integrations.manage`):
  estado del módulo (activar/desactivar, precio), keys (crear, ver secret una vez,
  rotar, revocar, configurar, IPs, scopes), webhooks (alta, eventos, probar,
  últimas entregas, reactivar), uso por día, link a la documentación.
- **Plan y facturación**: línea del módulo y total.
- **Superadmin → suscripción**: prender/apagar el módulo.
- **Landing**: fila "API de catálogo" en la comparación (Base/Pro: "+US$ 10/mes",
  Custom: incluido) y bloque explicando el beneficio.

## 11. Seguridad

- Secrets nunca en logs; el secret de webhook cifrado (AES-256-GCM existente).
- Toda consulta filtrada por `tenantId` de la key y por la visibilidad de
  proveedores del comercio (`tenant-visibility.service.ts`): nunca se expone un
  distribuidor oculto por la plataforma ni uno no configurado.
- Tests: guard (key/secret, Basic, IP, scope, módulo, rate limit), ids estables,
  agrupación, precios (contra los mismos casos que la web), cursor, firma de
  webhook, SSRF, export y feeds.

## 12. Endpoints de gestión (sesión del comercio, JWT)

Los usa la pantalla Configuración → API de catálogo. Envelope interno `{success,data}`.
Permiso: dueño, o el permiso nuevo `integrations.manage` (por defecto OWNER y ADMIN).

| Método | Ruta | Body | Respuesta `data` |
|---|---|---|---|
| GET | `/my/catalog-api` | — | `{ addon: { enabled, includedInPlan, priceUsd, since }, canManage, clients: ApiClientView[], providers: {key,label}[], docsUrl, baseUrl }` |
| POST | `/my/catalog-api/addon` | `{ enabled }` | `{ addon }` |
| POST | `/my/catalog-api/clients` | `{ name, scopes?, config?, ipAllowlist?, expiresAt? }` | `{ client: ApiClientView, secret }` (secret una sola vez) |
| PATCH | `/my/catalog-api/clients/:id` | `{ name?, scopes?, config?, ipAllowlist?, expiresAt? }` | `{ client }` |
| POST | `/my/catalog-api/clients/:id/rotate` | — | `{ client, secret, previousValidUntil }` |
| POST | `/my/catalog-api/clients/:id/revoke` | — | `{ client }` |
| POST | `/my/catalog-api/clients/:id/feed-token/rotate` | — | `{ client }` |
| GET | `/my/catalog-api/clients/:id/usage?days=30` | — | `{ days: [{ day, requests, errors }] }` |
| GET | `/my/catalog-api/clients/:id/webhooks` | — | `{ webhooks: WebhookView[] }` |
| POST | `/my/catalog-api/clients/:id/webhooks` | `{ url, events }` | `{ webhook, signingSecret }` (una sola vez) |
| PATCH | `/my/catalog-api/webhooks/:id` | `{ url?, events?, active? }` | `{ webhook }` |
| DELETE | `/my/catalog-api/webhooks/:id` | — | `{ id }` |
| POST | `/my/catalog-api/webhooks/:id/test` | — | `{ delivery }` |
| POST | `/my/catalog-api/webhooks/:id/rotate-secret` | — | `{ webhook, signingSecret }` |
| GET | `/my/catalog-api/webhooks/:id/deliveries?limit=50` | — | `{ deliveries: DeliveryView[] }` |
| PUT | `/admin/subscriptions/:tenantId/catalog-api-addon` | `{ enabled }` | suscripción (superadmin) |

```ts
type ApiClientView = {
  id: string; name: string; publicKey: string; secretLast4: string;
  feedToken: string; status: "ACTIVE" | "REVOKED"; scopes: string[];
  config: ApiClientConfig;            // efectiva (con defaults)
  ipAllowlist: string[]; rateLimitPerMinute: number;
  lastUsedAt: string | null; lastUsedIp: string | null;
  expiresAt: string | null; createdAt: string; revokedAt: string | null;
  feeds: { google: string; meta: string };   // URLs completas
};
type WebhookView = {
  id: string; url: string; events: string[]; active: boolean;
  consecutiveFailures: number; disabledAt: string | null; disabledReason: string | null;
  createdAt: string; lastDelivery: DeliveryView | null;
};
type DeliveryView = {
  id: string; eventId: string; type: string; status: "PENDING" | "DELIVERED" | "FAILED";
  attempts: number; lastStatusCode: number | null; lastError: string | null;
  createdAt: string; deliveredAt: string | null; nextAttemptAt: string | null;
};
```

Los tipos (`ApiClientConfig`, `ApiClientView`, `WebhookView`, `DeliveryView`,
scopes, eventos y defaults) viven en `packages/shared/src/catalog-api.ts`.

## 13. Decisiones de implementación (2026-10-05)

Lo que se precisó o cambió respecto de lo de arriba al construirlo:

- **Cambios incrementales con registro de eventos** (en vez de paginar por
  `updatedAt`). `ChangeTrackerService` (cron cada minuto, también de noche; solo
  comercios con alguna key activa) compara cada oferta contra su última versión
  (`ApiOfferState`) y escribe `ApiCatalogEvent` numerados: `offer.created`,
  `offer.updated` (con `changed`: `price`, `stock`, `product`), `offer.removed`,
  `provider.sync_paused/resumed` (`ApiCatalogTracker.pausedProviders`). La primera
  pasada solo toma la foto. Cada 10 min revisa ofertas borradas físicamente. Cada
  pasada vuelve a mirar los últimos 2 minutos (filas confirmadas tarde); repetir no
  duplica eventos. `/v1/changes` y los webhooks leen la misma secuencia.
- **Cursor de cambios** = id del último evento + fecha de emisión; vence a los 30
  días (`410 cursor_expired`). `ApiWebhookEndpoint.cursor` es ese id (`BigInt`).
- **Por key**: un cambio de algo que la key no ve (distribuidor excluido, sin stock
  si no lo incluye) llega como `offer.removed`; un alta que la key no ve no llega.
  Las bajas traen `offerId` y no `productId` (no se puede saber con certeza).
- **Códigos de error finales**: los 15 de la guía (`API_ERROR_CODES` en
  `core/api-error.ts`). Sin cotización para convertir: `503 internal_error` con
  `Retry-After`. Organización dada de baja: `401 invalid_credentials`.
- **Precio de venta**: neto × (1 + margen), más IVA e internos sobre ese neto; las
  percepciones no se trasladan. El redondeo se aplica a `sale.gross`. Montos de
  impuestos con 2 decimales.
- **Stock**: `null` = el distribuidor no informa cantidad → se considera disponible
  (`status: unknown`), salvo distribuidores con «ocultar sin precio/stock». Sin
  `includeOutOfStock`, entra si `stock ≥ max(1, minStock)`.
- **Alias «Proveedor N»** por orden de alta de la config del distribuidor.
- **`fields.raw` / `fields.priceHistory`** solo en `GET /v1/offers/{id}` (los
  listados no cargan datos crudos).
- **Feeds**: un producto entra con precio de venta y foto; `gtin` solo si el dígito
  verificador es válido (si no, `identifier_exists=no` cuando tampoco hay mpn).
- **Suscripción**: `price` es solo el plan; `monthlyTotal` = plan + módulo (Custom no
  suma); `addons.catalogApi` y su atajo `catalogApiAddon`. Activar/desactivar deja
  `SubscriptionEvent` (`ADDON_ENABLED/DISABLED`), auditoría y aviso en la bandeja
  (tipo `PLAN_REQUEST`). El cobro sugerido de un pago usa `monthlyTotal`.
- **Foto del catálogo** en memoria por comercio (60 s, se invalida cuando el
  rastreador registra cambios); la vista por key se calcula una vez por foto.
- **Impuestos**: `packages/shared/src/tax-lines.ts` es copia exacta de
  `apps/web/lib/tax.ts` (la web no depende de `@nodo/shared`); un test compara los
  dos archivos y falla si divergen.
- **Webhooks también por API**: `GET /v1/webhooks/{id}/deliveries` además de lo de §5.
  Apagado automático a los 20 fallos seguidos con aviso en la campana del comercio.
- **Permiso** `integrations.manage` (grupo «Integraciones», solo comercios).
