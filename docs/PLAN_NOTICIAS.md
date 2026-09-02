# Módulo Noticias — plan de producto

Documento vivo. Fuente de verdad de este módulo. Cualquier recorte se implementa
contra `docs/ARQUITECTURA_TENANTS.md`: aislamiento por `tenantId`, descubrimiento
cerrado, `TenantLink` como única puerta, publicidad como excepción de presencia,
nombres en pantalla (nunca slugs).

`BrandNews` del módulo viejo (`BrandAccount`, slugs, visibilidad por usuario)
**no se porta**. Se reconstruye encima de `Tenant` / `TenantLink`, igual que Tipo 3.

---

## 1. Qué es

Un **blog B2B de la red**. Marcas y distribuidores publican novedades con texto,
imágenes y adjuntos (lista de precios, PDF, Excel, link). Cada artículo puede
tener un enlace público opaco. El comercio entra a `/noticias` y ve un medio
profesional: un **hero** que rota las notas de quien paga publicidad, y abajo un
**feed** de artículos de su red, cada uno claramente de quién es.

Es un **módulo fijo de plataforma** (`ModuleKey = "news"`): está en la nav de los
tres tipos de organización, habilitado por defecto para todos los roles. El
superadmin puede apagarlo por usuario igual que el resto; el producto no lo trata
como extra de marca ni como campaña.

No reemplaza:

| Ya existe | Para qué queda |
|---|---|
| `/avisos` (`OrgNotification`) | Push puntual a una cuenta vinculada (“tu pedido”, “activamos la acción”). Inbox, no revista. |
| `BrandResource` materiales / capacitaciones | Archivo de venta permanente. Una noticia *puede* colgar un material, no lo sustituye. |
| Landing `/m/:publicKey` | Identidad pública de la marca. Las noticias son piezas sueltas, no la home de la marca. |
| Banners / slots de búsqueda | Creatividades del buscador. El hero de noticias es otro espacio, con otro cupo. |

Una noticia es **pull** (el lector entra al medio). Un aviso es **push** (le llega
a una cuenta). Publicar una nota puede *opcionalmente* disparar un aviso a los
vinculados; no es lo mismo.

---

## 2. Quién publica y quién lee

Solo `DISTRIBUTOR` y `BRAND` publican. El comercio nunca.

| Tipo | Publica | Lee |
|---|---|---|
| `RETAILER` | No | Red vinculada + anunciantes pagos |
| `DISTRIBUTOR` | Sí | Propias + marcas vinculadas. **Nunca** otro distro. |
| `BRAND` | Sí | Propias + distros vinculados. **Nunca** otra marca. |
| Superadmin | Modera | Todo |

Roles que pueden crear / editar / publicar:

| Org | Escribe | Solo lee |
|---|---|---|
| Distro | `OWNER`, `ADMIN`, `PRODUCT_MANAGER` (solo si la nota está acotada a marcas de su `ProductManagerScope`) | `SELLER`, `VIEWER` |
| Marca | `OWNER`, `ADMIN`, `MARKETING` | `COMMERCIAL`, `VIEWER` |

El `SELLER` del distro no arma el medio: el medio es de la organización, no del
vendedor. El `COMMERCIAL` de la marca opera acciones sobre cuentas concretas, no
el blog.

---

## 3. Visibilidad (innegociable)

La regla es la misma que el descubrimiento cerrado, con un recorte extra entre
pares: **un distro no es audiencia de otro distro, una marca no es audiencia de
otra marca**, aunque paguen publicidad.

```
RETAILER     ve  { autores con TenantLink ACTIVE } ∪ { autores con campaña ACTIVE de noticias }
DISTRIBUTOR  ve  { propias } ∪ { BRAND con TenantLink ACTIVE (yo soy client, la marca es supplier) }
BRAND        ve  { propias } ∪ { DISTRIBUTOR con TenantLink ACTIVE (el distro es client, yo soy supplier) }
```

Detalle:

1. El vínculo tiene que estar `ACTIVE`. `SUSPENDED` puede leer (la relación
   comercial sigue existiendo, igual que el chat). `REVOKED` / `PENDING` no.
2. La excepción de publicidad **solo aplica al comercio**. Un distro no ve el
   hero ni el feed de un competidor porque ese competidor pagó. Una marca no ve
   el blog de otra marca por la misma vía.
3. Pedir un artículo que no corresponde responde **404, no 403**. Confirmar que
   existe ya filtra la red.
4. En el feed del comercio, cada tarjeta dice de quién es (`Tenant.name` + logo
   + chip Marca / Distribuidor). Si llegó por publicidad y no hay vínculo, el
   chip es **Publicidad** y no hay catálogo, ni lista de precios, ni chat.
5. Un comercio nunca ve un autor que no esté en esa unión. No hay “explorar
   marcas”. No hay listado público de autores.

La publicidad **da presencia de la nota**, no abre el negocio. Adjuntos
comerciales (listas, Excel, PDF de precios) solo se sirven con `TenantLink`.
Aunque la nota esté en el hero, el archivo no viaja.

---

## 4. Hero pago y feed orgánico

Dos superficies, misma entidad `NewsArticle`.

### Hero (`placement: news`)

Espacio publicitario nuevo, no reusa `hero_main` del buscador.

| Slot | Qué es | Cupo inicial |
|---|---|---|
| `news_hero` | Carrusel grande arriba de `/noticias` | `maxConcurrent: 5` |
| `news_pin` (opcional, fase 2) | Una tarjeta “destacada” fija en el feed | 1 |

Condiciones para entrar al hero:

- La org tiene `advertisingEnabled` (lo prende el superadmin, igual que hoy).
- Hay una campaña `ACTIVE` en `news_hero`, dentro de vigencia.
- La campaña apunta a **un artículo publicado** (`campaign.linkUrl` interno o
  `featuredArticleId`), no a un banner suelto. El medio vende la nota, no un
  creativo paralelo.

Rotación: 6–8 s, pausa al hover, dots, swipe en mobile. Cada slide muestra
cover, titular, excerpt, autor (logo + nombre), chip Publicidad. Impresiones y
clicks reusan `AdEvent`.

Si no hay campañas activas, el hero no se inventa: o queda vacío y el feed
sube, o el superadmin puede dejar un slide institucional de NODO (mismo patrón
que los banners del buscador).

### Feed

Abajo, blog normal. Orden: `publishedAt` desc, con filtro por autor, tipo y
búsqueda. Las notas del hero **también** aparecen en el feed (el comercio las
puede reencontrar). Las orgánicas nunca entran al hero.

---

## 5. Enlace público

Cada artículo tiene `publicKey` opaca (como `BrandLanding.publicKey`). URL:

```
/n/:publicKey
```

Nunca `/noticias/acme-lanza-foo`. En pantalla, el título y el nombre de la org.

Reglas:

- El autor marca `public: true` al publicar. Default **false**: la nota vive
  solo in-app.
- Sin `public` o sin `PUBLISHED` → 404, idéntico a un key inventado.
- La página pública es marketing: titular, cover, cuerpo, galería, autor. **No**
  lista de precios, **no** SKUs con precio, **no** chat, **no** “pedir código”
  que revele que hay que vincularse con *esa* org si el visitante no está
  logueado. CTA genérico: entrar a NODO.
- Logueado + audiencia válida: la misma URL redirige o hidrata la ficha in-app
  (adjuntos, CTA Hablar / buscar).
- OG tags (`og:title`, `og:image`, `og:description`) para WhatsApp / mail.
- No hay índice `/n`, no hay sitemap de autores, no hay enumeración.

---

## 6. Contenido de una nota

Campos:

| Campo | Uso |
|---|---|
| `title` | Obligatorio |
| `excerpt` | Bajada del feed / hero / OG. Máx. ~200 caracteres |
| `bodyHtml` | Cuerpo sanitizado (reusa `sanitizeBrandHtml`) |
| `coverUrl` | Imagen 16:9 del hero y de la tarjeta |
| `kind` | Tipo editorial (chip de color) |
| `public` | Enlace público |
| `publishedAt` / `expiresAt` | Vigencia. Una lista de precios vence |
| `authorTenantId` | Org que publica. En UI: `Tenant.name` + logo |

Tipos (se toman los útiles del legado y se achican):

| `NewsKind` | Chip |
|---|---|
| `LAUNCH` | Lanzamiento |
| `INCOMING` | Próximo ingreso |
| `PRICE_LIST` | Lista de precios |
| `PROMO` | Promo / condiciones |
| `CATALOG` | Catálogo / material |
| `NOTICE` | Aviso comercial |
| `OTHER` | General |

No se portan los 11 `NewsType` del módulo viejo. Si hace falta uno más, se
agrega con etiqueta; no se reabre el enum de 16 estados de stock.

### Adjuntos

Tabla `NewsAttachment`, no un array de URLs:

| `kind` | Default de visibilidad |
|---|---|
| `PRICE_LIST` (xlsx/pdf) | Solo vínculo (`IN_APP`) |
| `FILE` (pdf, imagen) | `IN_APP`; el autor puede marcar `PUBLIC` |
| `LINK` | Según el autor |
| `RESOURCE` | Apunta a un `BrandResource` ya cargado |

Subida: `POST /assets/upload-file` (ya acepta PDF/Excel/imagen). Tope alineado
al chat (10 MB). En la ficha in-app, el adjunto se ve con nombre, tipo y fecha.
En la pública, solo si `PUBLIC`.

### Relacionados (fase 2)

Chips de SKU (`provider` + `externalId`) que, **si el lector es un comercio
vinculado a ese distro**, saltan a `/search` o a la ficha. Si no está vinculado,
el chip no se renderiza: no se filtra que el distro existe. Una marca puede
colgar SKUs de *sus* distros vinculados; un distro, de su propio `providerKey`.

También: vínculo opcional a una `BrandAction` vigente o a un material. No es
obligatorio para v1.

---

## 7. Modelo

```
NewsArticle
  id, tenantId, publicKey
  status          DRAFT | PUBLISHED | ARCHIVED
  kind            LAUNCH | INCOMING | PRICE_LIST | PROMO | CATALOG | NOTICE | OTHER
  title, excerpt, bodyHtml
  coverUrl
  public          Boolean
  publishedAt, expiresAt, featuredUntil?
  createdByUserId
  @@index([tenantId, status, publishedAt])
  @@unique([publicKey])

NewsAttachment
  articleId, kind, title, fileUrl, contentUrl
  visibility      IN_APP | PUBLIC
  resourceId?     → BrandResource

NewsImage
  articleId, url, sortOrder

AdSlot key=news_hero, placement=news
AdCampaign  + featuredArticleId?   (o linkUrl interno /noticias/:id)
```

Toda fila lleva `tenantId`. El lector nunca se resuelve por `User.role`.

Un `NewsVisibilityService` (hermano de `TenantVisibilityService`) calcula el
set de `authorTenantId` visibles para la sesión y filtra **todas** las queries
con `tenantId IN (...)`. Tests de aislamiento obligatorios, mismo espíritu que
`scripts/check-closed-discovery.mjs`.

---

## 8. Interfaz

Rutas:

| Ruta | Quién |
|---|---|
| `/noticias` | Los tres tipos. Feed + hero (el hero solo tiene sentido en comercio; en distro/marca el hero no muestra competencia: o propio destacado, o nada) |
| `/noticias/:id` | Ficha in-app. 404 si no es audiencia |
| `/noticias/nueva` · `/noticias/:id/editar` | Distro / marca con rol de escritura |
| `/n/:publicKey` | Pública, sin auth |

Nav: ítem **Noticias** suelto (acceso diario, como Inicio / Mensajes), no
escondido en Marcas ni en Cartera. Los tres `tenantType` lo ven.

### Feed profesional

- Hero a full width, 16:9, autor siempre visible (logo redondo + nombre + chip).
- Abajo, grilla de tarjetas (1 col mobile, 2 tablet, 3 desktop). Cada tarjeta:
  cover, chip de tipo, titular, excerpt de 2 líneas, fila de autor (logo +
  nombre + Marca/Distro), fecha relativa.
- Filtros: Todos · Marcas · Distribuidores · tipo · buscador. Un distro **no
  ve** el filtro Distribuidores: no hay nada que filtrar ahí.
- El autor se diferencia de verdad: acento con `primaryColor` de la marca si
  existe; el distro usa el tratamiento de `ProviderBadge` (nombre, no la clave).
- Vacío: copy distinto por tipo (“Todavía no hay notas de tus marcas
  vinculadas” vs “Publicá la primera novedad”).

### Editor

No un CMS genérico. Bloques: titular, bajada, cover, cuerpo (HTML sanitizado,
mismas garantías que el espacio de marca), galería, adjuntos, toggle público,
tipo, vigencia. Preview in-app y preview del enlace público. Publicar pide
confirmación si hay adjunto `PRICE_LIST` (queda in-app sí o sí).

### Distro / marca

En el home de cada uno, un atajo “Últimas notas” + “Nueva”. En el espacio in-app
de la marca, hueco `{{noticias}}` (fase 2): las últimas 3 públicas-para-ese-
vínculo, no las de otros.

---

## 9. Cosas que sumaría (prioridad)

Lo pedido (blog + hero pago + adjuntos + link público + aislamiento) es el
recorte. Esto es lo que lo deja de “muro de posts” y lo pone a nivel de medio
B2B. Ordenado por valor / costo.

**Entrar en v1**

1. **Vigencia y archivo automático.** `expiresAt` saca la lista de precios del
   feed sin borrar. El comercio no opera con un Excel de marzo.
2. **Aviso opcional al publicar.** Checkbox “Avisar a las cuentas vinculadas”.
   Crea `OrgNotification` con link a la nota. Default off: no spamear.
3. **Stats por nota.** Vistas in-app, clicks al adjunto, clicks del hero
   (además de `AdEvent`). El dueño ve qué lista se bajó.
4. **CTA contextual en la ficha.** Vinculado: Hablar / Ver en catálogo (si hay
   SKU y el comercio es retailer). Solo publicidad: “Conectate con un código”
   sin nombrar al resto de la red.
5. **Copiar enlace** (público o in-app) y compartir por WhatsApp con OG.

**Fase 2 — las que más profesionalizan**

6. **Programar publicación** (`scheduledAt`). El marketing arma el lunes y sale
   el jueves 9:00 America/Argentina/Buenos_Aires.
7. **`{{noticias}}` en el espacio de marca** y bloque en `/marcas/:linkId`.
8. **Chips de SKU** hacia búsqueda, fail-closed si no hay vínculo.
9. **Colgar un `BrandResource` o una acción** ya existente, sin duplicar archivos.
10. **Resumen semanal** (mail o aviso único): “3 notas nuevas de tus marcas”.
11. **Slot `news_pin`** para quien paga un destacado fijo además del carrusel.
12. **Borrador compartido del equipo** con “última edición por”.

**Después, si el producto lo pide**

13. Comentarios o “me sirve”: no en v1. El chat ya es el canal persona a persona.
14. RSS / newsletter externa: choca con descubrimiento cerrado.
15. Moderación editorial del superadmin (ocultar una nota sin borrar la org).
16. Video embed (YouTube/Vimeo sanitizado). Cover alcanza en v1.
17. Traducir el legado `BrandNews` → esto. No hay datos de producción que
    valgan la pena; el modelo viejo vive de slugs.

**Decisiones que no abriría**

- Distros viendo distros “anonimizados”. Rompe el recorte y filtra competencia.
- Precio de lista en la página pública. La ficha pública es marketing.
- Slug lindo en la URL. `publicKey` opaca, igual que `/m/:publicKey`.
- Un CMS tipo WordPress. Bloques acotados, HTML ya sanitizado.

---

## 10. Recorte de implementación

1. **Contrato y tipos.** `ModuleKey "news"`, nav, `NewsKind`, DTOs en
   `packages/shared`. Entrada pendiente en `API_CONTRACT.md`.
2. **Schema + `NewsVisibilityService` + tests de aislamiento.** Antes de UI.
3. **CRUD de autor** (`/my/news`) con roles. Upload cover / adjuntos.
4. **Feed + ficha in-app** (`/noticias`). Hero vacío todavía.
5. **Página pública** `/n/:publicKey`.
6. **Slot `news_hero`**, campaña atada a artículo, tracking, carrusel.
7. **Aviso opcional + stats + CTA.**
8. Fase 2: programar, `{{noticias}}`, SKUs, pin.

Verificación: un script `scripts/check-news-visibility.mjs` con tres orgs
(comercio, distro A, distro B, marca vinculada a A). Distro B no ve nada de A.
El comercio sin vínculo no ve a A salvo campaña activa. El adjunto `PRICE_LIST`
no sale en la pública ni al comercio solo-publicitado.

---

## 11. Contrato propuesto

### [FEATURE] Noticias (feed, CRUD, pública, hero)

- **Método**: GET | POST | PUT | DELETE
- **Ruta**:
  - `GET /news` — feed de la sesión (hero aparte: `GET /news/hero`)
  - `GET /news/:id` — ficha in-app
  - `POST /my/news` · `PUT /my/news/:id` · `DELETE /my/news/:id` — autor
  - `GET /my/news` — borradores y publicadas de *mi* org
  - `GET /public/news/:publicKey` — ficha pública (sin auth)
  - `POST /news/:id/track` — view | attachment_click
- **Auth**: Bearer, organización. Pública: sin auth. Publicar: distro/marca con
  rol de escritura. Hero: comercio (y superadmin).
- **Body / Params**: `{ title, excerpt, bodyHtml, coverUrl, kind, public, publishedAt?, expiresAt?, attachments[], imageUrls[] }` · feed `kind`, `authorType`, `q`, `cursor`
- **Respuesta esperada**:
  - feed `{ items: NewsCard[], nextCursor? }`
  - hero `{ slides: NewsHeroSlide[] }` (`advertiser`, `articleId`, `campaignId`)
  - ficha `{ article, author: { name, type, logoUrl, linked, advertised }, attachments[], canDownloadCommercial }`
  - pública: mismo recorte **sin** adjuntos `IN_APP` y sin `linked`
- **Estado**: PENDIENTE
- **Notas**: 404 si no es audiencia. `canDownloadCommercial` es true solo con
  `TenantLink`. El hero solo incluye campañas `ACTIVE` del slot `news_hero`.
  Distro y marca reciben feed sin slides de pares. Módulo fijo: `news` en
  `MODULE_KEYS`, default on. UI: `/noticias`, `/n/:publicKey`. No reusar
  `/brand/news` ni `BrandNews`.
