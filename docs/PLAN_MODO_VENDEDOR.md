# Modo vendedor — diseño

Planes **Pro y Custom** (capacidad `sellerMode`). Separa el **costo** (lo que
cobra el distribuidor, el mismo de siempre en NODO) del **precio de venta**
(costo + margen), que es lo que ve y cotiza el vendedor del comercio.

Decisiones del dueño del producto (2026-10-05):

| Tema | Decisión |
|---|---|
| Qué ve el rol Vendedor (SELLER del comercio) | **Solo precio de venta.** El costo no se ve ni viaja al navegador |
| El costo | El original que maneja NODO. El margen no lo modifica: la venta es una capa aparte |
| Base del margen | **Configurable por distribuidor**: sobre costo final (con impuestos) o sobre neto (+ IVA después) |
| Categorías | Las propias de cada distribuidor (cómo él las llama), mostrando el nombre de NODO al lado si está unificada |
| Mejoras extra | Ninguna por ahora, salvo un margen general del comercio. Sin plantillas globales: la unificación de categorías no cubre todos los distribuidores |
| Aviso | Pop-up de novedad a **todos** los usuarios existentes, una vez, cuando esté terminado |

Hoy nadie usa el viejo "Markup sobre el precio del proveedor" (todas las
configuraciones en 0, medido en producción). Deja de modificar el costo y se
reemplaza por el margen general de venta del distribuidor.

---

## 1. Cómo se calcula el precio de venta

Margen de cada producto, gana el más específico:

1. **Producto** (distribuidor + externalId)
2. **Categoría del distribuidor** (la categoría cruda del distribuidor, normalizada)
3. **General del distribuidor**
4. **General del comercio**
5. Sin regla → 0 % (venta = costo) y se marca `source: "none"`.

Base por distribuidor (`saleMarginBase`):

- `FINAL` (default): `venta final = costo final × (1 + m)`; la venta neta se
  muestra como `venta final / (1 + alícuota de IVA)` cuando hay IVA.
- `NET`: `venta neta = costo neto × (1 + m)`; `venta final = venta neta + IVA +
  internos` (las percepciones no se trasladan).

Redondeo a 2 decimales en la moneda del producto (USD). La conversión a ARS es
la misma de siempre (preferencia del usuario). Margen permitido: −50 % a 1000 %;
negativo pide confirmación en la UI.

## 2. Datos (Prisma, migración solo aditiva)

```prisma
enum SaleMarginScope { STORE PROVIDER CATEGORY PRODUCT }
enum SaleMarginBase { FINAL NET }

model SaleMarginRule {
  id          String          @id @default(uuid())
  tenantId    String
  scope       SaleMarginScope
  provider    String?         // null en STORE
  categoryKey String?         // categoría normalizada (CATEGORY)
  categoryLabel String?       // cómo la llama el distribuidor (para mostrar)
  externalId  String?         // PRODUCT
  /// Clave única legible: STORE | P:<prov> | C:<prov>:<cat> | X:<prov>:<extId>
  ruleKey     String
  percent     Decimal         @db.Decimal(7, 3)
  updatedById String?
  updatedAt   DateTime        @updatedAt
  createdAt   DateTime        @default(now())
  @@unique([tenantId, ruleKey])
  @@index([tenantId, provider])
}

model SaleMarginChange {        // historial (quién cambió qué)
  id        String   @id @default(uuid())
  tenantId  String
  userId    String?
  ruleKey   String
  before    Decimal? @db.Decimal(7, 3)   // null = no había regla
  after     Decimal? @db.Decimal(7, 3)   // null = se borró (vuelve a heredar)
  createdAt DateTime @default(now())
  @@index([tenantId, createdAt])
}

// ProviderSyncConfig: + saleMarginBase SaleMarginBase @default(FINAL)
// User: + seenAnnouncements String[] @default([])
```

`priceMarkupPercent` queda en la tabla sin uso (no se borra columna) y deja de
aplicarse al costo en `catalog-view.ts`.

## 3. Quién ve qué (se aplica en el servidor)

- Permiso nuevo `prices.viewCost` (packages/shared/permissions.ts). Default:
  OWNER, ADMIN, BUYER sí; **SELLER no**; VIEWER no. Editable en la matriz de permisos.
- Con `sellerMode` habilitado y **sin** `prices.viewCost`, todas las respuestas
  del catálogo (búsqueda, catálogo por proveedor, ficha, featured/by-category/
  by-brand, comparador, historial de precios) **reemplazan** el costo por la venta
  y **quitan** todo lo que permita reconstruir el costo: `price`/`finalPrice` de
  costo, impuestos de costo, `raw` (o al menos sus importes), descuentos de lista.
  Se agrega `viewerMode: "seller"`.
- Rutas de compra (carrito, checkout, pedidos, cuenta corriente, facturas,
  analytics de compras) para quien no tiene `prices.viewCost`: se revisa que ya
  estén protegidas por sus permisos actuales; si no, se bloquean con 403 y se
  ocultan en la navegación.
- Sin `sellerMode` (plan Base): todo sigue como hoy.
- Quien tiene `prices.viewCost` recibe ambos: `price`/`finalPrice` (costo) y
  `sale: { price, finalPrice, marginPercent, source, base }`.

### Auditoría de endpoints (implementado)

Cómo se aplica: `@SalePriced()` + `SalePricingInterceptor`
(apps/api/src/pricing/) agrega `sale` a cada producto de la respuesta y, para
quien no ve costos, reemplaza el costo por la venta, saca `raw` y deja
`sale.marginPercent/source/base = null` (con el margen se despejaría el costo).
`@CostSensitive()` y las capacidades de compra (`directCheckout`,
`providerPortalAccess`, `providerAccountAccess`, `advancedAnalytics`) cortan en
el `TenantGuard` con **403 `COST_HIDDEN`**. Un test
(`pricing/route-audit.spec.ts`) recorre los controllers y falla si una ruta de
catálogo no tiene venta o una de compra queda abierta.

| Endpoint | Quién ve costos | Vendedor (sin `prices.viewCost`) |
|---|---|---|
| `GET search/provider/:provider` | costo + `sale` | solo venta |
| `GET providers/:provider/catalog` | costo + `sale` | solo venta |
| `GET providers/:provider/products/:externalId` | costo + `sale` | solo venta |
| `GET providers/:provider/products/:externalId/price-history` | costo | serie de venta (margen de hoy) |
| `GET catalog/featured` (bajas de precio) | costo + `sale` | venta; precio anterior también en venta (el % de baja se conserva) |
| `GET catalog/by-category` · `by-provider` · `by-brand` | costo + `sale` | solo venta |
| `GET catalog/categories` · `catalog/brands` | sin precios | igual |
| `cart/*` (carrito del comercio) | igual que antes | 403 `COST_HIDDEN` |
| `orders/*` (pedidos, aprobación, offline, analytics) | igual que antes | 403 |
| `providers/*/checkout/*`, `*/drafts`, cuenta corriente, documentos, pagos | igual que antes | 403 |
| `providers/:provider/imports*`, import-profile, list-cadence (listas = costos) | igual que antes | 403 |
| `providers/:provider/freshness` (fechas de la lista) | — | abierto (`CostSensitive(false)`) |
| `providers/:provider/sync/runs/:id` (antes/después de cada precio) | igual que antes | 403 |
| `providers/:provider/sync/runs`, `status`, `config` | sin importes de costo | igual |
| `providers/:provider/sale-margins*`, `my/sale-margins/*` | leer; escribir con `pricing.manage` | 403 |
| `my/own-store` (Tu web) | precio de la web, sin costo | igual (la web compara contra la venta) |
| `retail/*` (precios de mercado), espacios de marca | sin costos del comercio | igual |
| API de catálogo `/v1` | según la key | — (las keys las maneja `integrations.manage`) |

Decisión: el **vendedor no compra**. Carrito, checkout, pedidos y cuenta
corriente operan con costos (el carrito guarda el precio de costo y los portales
cotizan costos), así que con el modo vendedor quedan para quien tiene «Ver
costos». Si un comercio quiere que su vendedor compre, le da ese permiso en la
matriz de permisos (y entonces ve costos). Con plan Base no cambia nada.

## 4. Endpoints (JWT, envelope normal)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/my/sale-margins/settings` | margen general del comercio |
| PUT | `/my/sale-margins/settings` | `{ storePercent }` |
| GET | `/providers/:provider/sale-margins` | `ProviderSaleMargins`: `{ provider, base, providerPercent, storePercent, categories: [{ key, label, nodoLabel, products, percent, effective, source, sample }] }` |
| PUT | `/providers/:provider/sale-margins` | `{ base?, providerPercent? }` |
| PUT | `/providers/:provider/sale-margins/categories` | `{ keys: string[], percent: number \| null }` (null = quitar, vuelve a heredar) |
| GET | `/providers/:provider/sale-margins/products?category=&q=&cursor=&limit=` | productos con `cost`, `percent?`, `effective`, `source`, `sale` |
| PUT | `/providers/:provider/sale-margins/products` | `{ externalIds: string[], percent: number \| null }` |
| PUT | `/providers/:provider/sale-margins/products/by-category` | `{ category, percent }` aplica a todos los productos de la categoría como regla de categoría (atajo) |
| GET | `/my/sale-margins/history?provider=&limit=` | `SaleMarginHistoryEntry[]` (quién, de cuánto a cuánto, etiqueta legible) |
| GET | `/me/announcements` | `{ seen, pending }` |
| POST | `/me/announcements/:key/seen` | marca un aviso como visto (idempotente; key fuera de `ANNOUNCEMENTS` → 400). Mandar sin body o con `{}` |

Permiso para editar márgenes: nuevo `pricing.manage` (OWNER y ADMIN por defecto).
Todo con `@RequiresCapability("sellerMode")`.

## 5. Pantallas

**Proveedor → configuración → "Márgenes de venta"** (sección nueva, Pro/Custom; en
Base: upsell):

- Cabecera: base (costo final / neto, con explicación y ejemplo), margen general
  del distribuidor, margen general del comercio (editable desde acá, avisando que
  vale para todos los distribuidores).
- Tabla de categorías del distribuidor: casilla, nombre (como lo llama el
  distribuidor) + etiqueta con el nombre de NODO si está unificada, cantidad de
  productos, margen (input), de dónde sale (Propio / Distribuidor / Comercio),
  ejemplo (costo → venta de un producto típico). Buscador, seleccionar todo /
  visibles, barra de acción para seleccionadas: "Aplicar X %" y "Quitar margen propio".
- Al abrir una categoría: panel lateral con sus productos (paginado, buscador):
  foto, nombre, costo, margen, venta, origen; selección múltiple y misma barra de
  acción; edición en línea por producto.
- Guardado optimista con deshacer; aviso de margen negativo o mayor a 200 %.
- Historial de cambios (quién, cuándo, de cuánto a cuánto).

**Búsqueda, ficha, comparador**: para el vendedor el precio grande es la venta
(con la etiqueta "Precio de venta"); para quien ve costos, costo y venta lado a
lado + interruptor "Ver como vendedor" (preferencia local) que muestra la
pantalla igual que el vendedor. La comparación con "Tu web" usa la venta para el
vendedor.

**API de catálogo**: `markup.mode = "provider"` pasa a usar estas reglas de margen
(producto > categoría > distribuidor > comercio) y su base.

**Pop-up de novedad** (`seller-mode-2026-10`): a todos los usuarios existentes,
una sola vez (guardado en `User.seenAnnouncements`), al entrar a la app. Texto
según rol y plan:
- Dueño/admin con Pro o Custom: qué es, cómo se configura, botón "Configurar
  márgenes".
- Vendedor: "ahora ves precios de venta".
- Base: qué es y que está en Pro (sin presionar).
Accesible (foco, Escape), no aparece durante el recorrido de onboarding.

## 6. Tests

Resolución de margen (las 5 capas), base FINAL/NET con y sin IVA, redondeo,
ocultamiento de costo para SELLER en cada endpoint de catálogo (que no viaje ni
en `raw`), permisos de edición, capacidad por plan, bulk de categorías y
productos, historial, API de catálogo con las reglas, aviso visto.

## 7. Implementación

- Tipos del contrato y cuenta pura: `packages/shared/src/sale-margins.ts`
  (`resolveSaleMargin`, `computeSalePrice`, `saleCategoryKey`, `saleRuleKey`,
  `ANNOUNCEMENTS`, filas de las respuestas). La web puede usar `computeSalePrice`
  para la vista previa del editor y da exactamente lo mismo que el servidor.
- Servidor: `apps/api/src/pricing/` — `cost-visibility.ts` (quién ve costos,
  `@CostSensitive`), `sale-margin-rules.service.ts` (reglas por comercio,
  caché 60 s, se invalida al escribir), `sale-pricing.ts` + interceptor,
  `sale-margins.service.ts`/`controller.ts`, `announcements.controller.ts`.
- `GET /onboarding/status` suma `seenAnnouncements` (la web ya lo lee al entrar).
- Categoría del margen: la **cruda** del distribuidor (`ProviderSyncCache.category`),
  normalizada (minúsculas, sin tildes, espacios simples). `nodoLabel` sale de
  `resolveCatalogDisplay` sobre un producto de ejemplo.
- `priceMarkupPercent` ya no se aplica al costo en ningún lado (catálogo,
  historial, bajas de precio). La API de catálogo con `markup.mode = "provider"`
  usa estas reglas y la base del distribuidor (FINAL: costo final × margen; con
  margen fijo de la key, siempre sobre el neto).
- Errores para la web: 403 `{ code: "COST_HIDDEN" }` en rutas de costos; 403
  `PLAN_FEATURE_UNAVAILABLE` (capability `sellerMode`) en márgenes con plan Base.
