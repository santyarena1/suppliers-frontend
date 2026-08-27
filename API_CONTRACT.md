# API Contract — NODO

Contrato entre `apps/web` y `apps/api`. Actualizado con el rediseño del buscador.

## Implementado

### [FEATURE] Banners con slot de grid
- **Método**: GET | POST | PUT | DELETE (admin) · GET público `/banners`
- **Ruta**: `/banners`, `/admin/banners`, `/admin/banners/:id`
- **Auth**: Bearer (admin para CRUD) · Bearer usuario para listado activo
- **Body / Params**: `position` (`home` | `search`), `slot` opcional (`hero_main`, `hero_side`, `tile_1`…`tile_4`, `strip`), `imageUrl`, `title`, `subtitle`, `linkUrl`, `order`, `active`
- **Respuesta esperada**: `Banner[]` o `Banner`
- **Estado**: IMPLEMENTADO
- **Notas**: El slot define la posición en el grid descontructurado del landing del buscador.

### [FEATURE] Identidad visual (preset de color)
- **Método**: GET | PUT
- **Ruta**: `/platform/settings` (público autenticado) · `/admin/platform/settings` (admin)
- **Auth**: Bearer token requerido
- **Body / Params**: `{ brandPreset: "violet" | "gamer_red" | "ocean" | "emerald" }`
- **Respuesta esperada**: `{ id: "platform", brandPreset: string }`
- **Estado**: IMPLEMENTADO
- **Notas**: El frontend aplica el preset como CSS variables (`--brand-*`).

### [FEATURE] Gestión completa de usuarios (admin)
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: `/admin/users`, `/admin/users/:id`, `/admin/users/:id/password`, `/admin/users/:id/role`, `/admin/users/:id/active-status`, `/admin/users/:id/end-date`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**: crear `{ username, email, password?, role, brandId?, active?, endDate? }` · editar `{ username?, email?, brandId? }` · password `{ password? }` (mín. 8)
- **Respuesta esperada**: lista enriquecida con `brand`, `providers` (nombres, sin secretos), `brandAccesses`
- **Estado**: IMPLEMENTADO
- **Notas**: `GET /admin/users` no devuelve hashes ni credenciales de distribuidores. `endDate: null` limpia el vencimiento. Al crear o resetear sin `password`, la plataforma genera una y la devuelve en `generatedPassword`; como solo se guarda el hash, esa es la única vez que puede leerse.

### [FEATURE] Entrar como otro usuario (suplantación)
- **Método**: POST
- **Ruta**: `/admin/users/:id/impersonate`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**: sin cuerpo (mandar `{}`: Fastify rechaza un `content-type` JSON vacío)
- **Respuesta esperada**: `{ token, user: { id, username, email, role, active, brandId? } }`
- **Estado**: IMPLEMENTADO
- **Notas**: El token vale 1 hora y agrega al payload `impersonatedBy` e `impersonatedByUsername`, para que toda acción de esa sesión sea atribuible al administrador. Se rechaza contra otro `ROLE_ADMIN`, contra uno mismo, y desde una sesión ya suplantada. Cada uso queda en `AuditLogEntry` con acción `IMPERSONATE`.

### [FEATURE] Árbol de organizaciones (multi-tenant)
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: `/admin/tenants`, `/admin/tenants/:id`, `/admin/tenants/:id/members`, `/admin/tenants/:id/members/new-user`, `/admin/tenants/members/:membershipId`, `/admin/tenants/members/:membershipId/managed-brands`, `/admin/tenants/links`, `/admin/tenants/links/:linkId`, `/admin/tenants/:id/access-codes`, `/admin/tenants/access-codes/:codeId`, `/admin/tenants/users/:userId/relations`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**: organización `{ name, type: "RETAILER" | "DISTRIBUTOR" | "BRAND", providerKey?, brandId?, contactEmail?, contactPhone?, notes?, advertisingEnabled?, active? }` · membresía `{ userId | (username, email, password), role, title? }` · vínculo `{ clientTenantId, supplierTenantId, accountManagerId?, status?, discountPercent?, notes? }` · código `{ label?, maxUses?, expiresInDays? }`
- **Respuesta esperada**: `GET /admin/tenants` devuelve `{ tenants: TenantNode[], unassignedUsers: [] }`, cada `TenantNode` con `members`, `suppliers`, `clients` y `accessCodes`
- **Estado**: IMPLEMENTADO
- **Notas**: `tenantRole` es el alcance dentro de la organización y `platformRole` el nivel de acceso a Nodo. El lado cliente de un vínculo siempre es un comercio. Ver `docs/ARQUITECTURA_TENANTS.md`.

### [FEATURE] Proveedores visibles y canje de código de vinculación
- **Método**: GET | POST
- **Ruta**: `/my/providers`, `/my/redeem-code`
- **Auth**: Bearer usuario con organización
- **Body / Params**: canje `{ code }`
- **Respuesta esperada**: `VisibleProvider[]` con `{ provider, name, linked, advertised, accountManager, discountPercent }` · canje `{ linkId, tenantName, tenantType, provider }` recién después de canjear
- **Estado**: IMPLEMENTADO
- **Notas**: `/my/providers` es la única fuente de qué proveedores existen para un comercio. Todos los rechazos del canje responden lo mismo para que no se puedan enumerar códigos ni organizaciones.

### [FEATURE] Pedidos de la organización y aprobación
- **Método**: GET | POST
- **Ruta**: `/orders`, `/orders/pending-approval`, `/orders/insights`, `/orders/:id/approve`, `/orders/:id/reject`
- **Auth**: Bearer usuario con organización · aprobar y rechazar, solo OWNER o ADMIN
- **Body / Params**: rechazo `{ reason? }` · insights `days` (`30` | `90` | `365` | `0` = todo el historial; default `90`)
- **Respuesta esperada**: pedido con `{ id, provider, providerName, status, approvalStatus, createdBy, approvedBy, total, items }` · `/orders/pending-approval` devuelve `{ canApprove, needsApproval, orders }` · `/orders/insights` es el tablero del comercio de la sesión
- **Estado**: IMPLEMENTADO
- **Notas**: Un vendedor que confirma un checkout recibe `status: "PENDING_APPROVAL"` y el pedido no se manda al proveedor. Al aprobarlo se reenvía el borrador guardado tal cual. Ver `docs/PLAN_AISLAMIENTO.md`. **Insights nunca cruza locales**: filtra siempre por `tenantId`. Solo cuenta pedidos `CREATED` u `OFFLINE`. El payload incluye `ops` (envíos, pagos, direcciones, sucursales, impuestos, autores) armado con lo que cada pedido ya guardó: no se inventan fletes.

### [FEATURE] Referencias de precio de venta (locales)
- **Método**: GET · POST (admin)
- **Ruta**: `/retail/search?q=&take=` · `/retail/products/:id` · `/admin/retail/ingest` · `/admin/retail/ingest/status` · `/admin/retail/stores` · `/admin/retail/stores/:id/products` · `/admin/retail/stores/:id/ingest`
- **Auth**: Bearer usuario · admin retail solo ROLE_ADMIN
- **Body / Params**: `q` búsqueda · listado de productos de local con `q/page/take` · ingest sin body
- **Respuesta esperada**: `{ query, tokens, results: [{ id, name, price, description, productUrl, imageUrl, categoryName, syncedAt, store: { name, logoUrl }, priceHistory: [...] }] }`
- **Estado**: IMPLEMENTADO
- **Notas**: La UI muestra “Precios de venta encontrados” / local (tienda). La app nunca consulta la fuente externa en vivo. Cron **cada 5 minutos las 24 h** (timezone solo para el tamaño de tanda: de 06–21 AR batch chico `RETAIL_INGEST_DAY_BATCH` default 8; de noche `RETAIL_INGEST_NIGHT_BATCH` default 20). Al levantar el API arranca a los 10 s (no espera al próximo */5). Si una corrida se cuelga (>15 min sin heartbeat) se libera el lock y el cron sigue. Admin “Sincronizar todo” hace **full en background hasta terminar**; si hay un batch del cron, lo cancela al cerrar la tienda actual y encola el full. Progreso en `RetailIngestRun` (`storesDone/storesTotal`, `currentStoreName`, `heartbeatAt`). Ingesta más rápida: páginas de 100, upserts en paralelo, sin persistir `raw` del producto, historial limitado. `priceDivisor` por local corrige centavos (Multiplo). `RETAIL_INGEST_DISABLED=true` apaga el cron.

### [FEATURE] Dashboard de compras del local (proveedores)
- **Método**: GET
- **Ruta**: `/orders/insights?days=`
- **Auth**: Bearer, organización de la sesión (el superadmin sin “entrar como” no ve data de nadie)
- **Body / Params**: `days` opcional, default 90. `0` = todo el historial del comercio
- **Respuesta esperada**: `{ tenantName, periodDays, kpis, concentration, channelMix, byMonth, byMonthDay, byWeekday, byProvider, byBrand, byCategory, bySubcategory, brandProviders, topProducts, recentOrders, ops }`
- **Estado**: IMPLEMENTADO
- **Notas**: La data es **solo de ese local**. `ops` agrega envíos (retiro vs domicilio, flete por mes/proveedor), formas de pago, direcciones más usadas, sucursales, IVA/percepciones y quién armó el pedido. El flete **no se inventa ni se convierte**. New Bytes guarda la cotización en **ARS** (`shippingArs`); Elit/Invid/Air solo cuentan en **USD** si el pedido trajo `shippingCost` creíble. No se usa `total − subtotal − impuestos`: en Invid `impuestos` son internos y ese resto es IVA, no envío. El comercio puede **unificar** etiquetas de dirección/pago/entrega/sucursal (`PUT /orders/insights/aliases`, `PATCH/DELETE /orders/insights/aliases/:groupId`, `POST .../split`) para que distintas escrituras cuenten como una sola real; `ops.suggestions` propone pares que se parecen (sin unificar solo). `byMonthDay` suma por día 1–31 (hora de Argentina) para ver si se compra más a principio, mitad o fin de mes. Marcas/distribuidores/categorías traen ticket, mix portal/offline, evolución mensual, días de la semana, SKUs/marcas/categorías distintas, recompra y delta vs el período anterior.

### [FEATURE] Pedido offline y compras en esquema (comercio tipo 1)
- **Método**: GET | PUT · POST | PATCH (pedidos)
- **Ruta**: `/providers/:provider/config` · `GET /my/providers` (`purchase`) · `POST /orders/offline` · `PATCH /orders/:id`
- **Auth**: Bearer, organización comercio (RETAILER) para usarlas; la config la guarda el tenant actual. Pedidos: rol que puede armar pedidos.
- **Body / Params**: config `{ acceptsOffline?, acceptsScheme?, offlineIvaAdjustment?, schemeIvaAdjustment?, schemeDiscountPercent? }`. Alta offline `{ orders: [{ provider, notes?, quoteRate?, items: [{ externalId, name, qty, unitPrice, internosAmount?, ivaPercent?, internosPercent? }] }] }`. Edición `{ notes?, items? }`.
- **Respuesta esperada**: `ProviderConfig` / `purchase` por proveedor. `POST /orders/offline` y `PATCH /orders/:id` devuelven `TenantOrder` con `channel: "OFFLINE"`, `status: "OFFLINE"`, `approvalStatus: "APPROVED"`, `editable: true`.
- **Estado**: IMPLEMENTADO
- **Notas**: Offline = compra sin facturar (antes “.com”); **no se llama al portal del proveedor**. Sí se registra en Nodo como pedido **aprobado** y se puede editar (cantidades, precio, notas) si el vendedor cambia algo. El mensaje al vendedor se copia aparte. **Sin percepciones (IIBB); internos sí.** Esquema = facturado, con % extra que carga el comercio una vez por distribuidor (no aplica a ítems sueltos del carrito online); al portal los ítems van sueltos. El IVA de offline y el de esquema son independientes. Si offline está activo, `offlineIvaAdjustment` es obligatorio; si esquema está activo, `schemeIvaAdjustment` es obligatorio. Si el proveedor no informa alícuota de IVA (p. ej. Ceven), offline/esquema quedan deshabilitados: no se inventa 21%, 0% ni 10,5%. Aprobar un pedido offline está bloqueado: no hay envío al portal.

### [FEATURE] Unificar direcciones, pagos y envíos del local
- **Método**: PUT · PATCH · DELETE · POST
- **Ruta**: `PUT /orders/insights/aliases` · `PATCH /orders/insights/aliases/:groupId` · `DELETE /orders/insights/aliases/:groupId` · `POST /orders/insights/aliases/:groupId/split`
- **Auth**: Bearer, organización de la sesión (solo ese comercio)
- **Body / Params**: unificar `{ kind: "ADDRESS"|"PAYMENT"|"DELIVERY"|"WAREHOUSE", keys: string[], label }` · renombrar `{ label }` · split `{ keys }` (saca esas escrituras del grupo)
- **Respuesta esperada**: `{ groupId, kind?, label?, keys? }`. El GET `/orders/insights` aplica los alias: filas unificadas traen `groupId`, `unified`, `variants`; `ops.suggestions` lista parecidos sin unificarlos.
- **Estado**: IMPLEMENTADO
- **Notas**: No cruza locales. No se unifica en automático: el comercio elige. Las claves crudas son el texto que ya guardó cada pedido.

### [FEATURE] Módulo Catálogo (admin)
- **Método**: GET | POST | PATCH | PUT | DELETE
- **Ruta**: `/admin/catalog-enrichment/board` · `/terms` · `/link` · `/move` · `/visibility` · `/incomplete` · `/products/assign` · `/preview` · `/ai/suggest-merges` · `/ai/product-hint` · `/openai`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**:
  - board `?kind=CATEGORY|BRAND|SUBCATEGORY`
  - link `{ kind, items:[{provider,rawKey}], label?|termId? }`
  - move `{ kind, from:{provider,rawKey}, toLabel?|toTermId?, deleteEmptySourceTerm? }`
  - terms CRUD `{ kind, label, parentId?, visible? }`
  - assign producto `{ provider, externalId, displayBrand?, displayCategory?, displaySubcategory? }`
- **Respuesta esperada**: board `{ rows, terms, stats }` · incomplete `{ items, total }` · preview productos
- **Estado**: IMPLEMENTADO
- **Notas**: Lista todas las categorías/marcas crudas de todos los distribuidores. Vincular o trasladar productos a un término canónico (con visibilidad y jerarquía padre/hijo). Overrides por producto en `PlatformProductCatalogOverride` (no pelean con el sync). Sin flujo especial de códigos Air.

### [FEATURE] Sincronización de imágenes (Primera foto / Serper)
- **Método**: GET | PUT | DELETE | POST
- **Ruta**: `/admin/images/status` · `/admin/images/missing` · `/admin/images/history` · `/admin/images/serper` · `/admin/images/cron` · `/admin/images/first-photo` · `/admin/images/first-photo/stop` · `/admin/images/products/:productId/serper-search` · `/admin/images/products/:productId/image`
- **Auth**: Bearer ROLE_ADMIN (solo superadmin)
- **Body / Params**: guardar clave `{ apiKey }` · primera foto `{ provider?, batchSize?: 1–50, once?: boolean }` · missing `take`, `provider`
- **Respuesta esperada**: status `{ hasSerperKey, missing, pending, pendingVisible, pendingDeferred, filled, running, byProvider, lastRun }` · first-photo `{ started, reason? }` · missing `{ items: [{ id, provider, name, query, inCatalog, ... }] }`
- **Estado**: IMPLEMENTADO
- **Notas**: Rellena `ProviderSyncCache.imageUrl` **solo si está vacío** (salvo edición manual). Busca en `POST https://google.serper.dev/images` (`X-API-KEY`, `gl=ar`, `hl=es`) y toma la primera `imageUrl`. Corre en segundo plano de a tandas de 50. La API key se cifra y nunca se devuelve. Cada producto tocado queda en `ImageSyncFill` (historial editable). **Prioridad**: primero los que se muestran en algún catálogo (`TenantProductOffer.active` y `stock > 0`); sin stock, ocultos o sin oferta quedan para **después** (cuando ya no hay visibles pendientes, el cron los hace solo). **Editar**: `POST /admin/images/products/:productId/serper-search` `{ query? }` → `{ query, images[] }`; `PUT /admin/images/products/:productId/image` `{ imageUrl, source: serper_pick|upload }`. **Historial**: `GET /admin/images/history?page=&take=&status=&provider=&q=`. **Cron** 8:00 y 20:00 `America/Argentina/Buenos_Aires`, tope 200 por corrida (`IMAGE_SYNC_CRON_LIMIT`), se apaga con `IMAGE_SYNC_CRON_DISABLED=true` o `PUT /admin/images/cron { enabled }`. Los “sin resultado” no se reintentan solos: se editan desde el historial. El sync de catálogo no borra una foto de Serper si el proveedor sigue vacío.

## Pendiente (futuro)


### [FEATURE] Upload de imágenes (assets)
- **Método**: POST
- **Ruta**: `/assets/upload`
- **Auth**: Bearer token requerido (cualquier usuario autenticado)
- **Body / Params**: `multipart/form-data` con campo `file` (imagen JPEG, PNG, WebP, GIF o SVG, máx. 5 MB)
- **Respuesta esperada**: `{ url: "/assets/<uuid>" }`
- **Estado**: IMPLEMENTADO
- **Notas**: Los bytes se guardan en Postgres (`StoredAsset`) y se sirven en `GET /assets/<uuid>` (público, sin auth). Así viajan con la DB entre máquinas/deploys. Banners y logos aceptan URL externa, path `/assets/...` o legacy `/uploads/...` (disco local; se mantiene por compatibilidad).
