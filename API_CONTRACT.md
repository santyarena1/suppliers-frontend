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
- **Ruta**: `/orders`, `/orders/pending-approval`, `/orders/:id/approve`, `/orders/:id/reject`
- **Auth**: Bearer usuario con organización · aprobar y rechazar, solo OWNER o ADMIN
- **Body / Params**: rechazo `{ reason? }`
- **Respuesta esperada**: pedido con `{ id, provider, providerName, status, approvalStatus, createdBy, approvedBy, total, items }` · `/orders/pending-approval` devuelve `{ canApprove, needsApproval, orders }`
- **Estado**: IMPLEMENTADO
- **Notas**: Un vendedor que confirma un checkout recibe `status: "PENDING_APPROVAL"` y el pedido no se manda al proveedor. Al aprobarlo se reenvía el borrador guardado tal cual. Ver `docs/PLAN_AISLAMIENTO.md`.

### [FEATURE] Referencias de precio de venta (locales)
- **Método**: GET · POST (admin)
- **Ruta**: `/retail/search?q=&take=` · `/retail/products/:id` · `/admin/retail/ingest` · `/admin/retail/ingest/status` · `/admin/retail/stores` · `/admin/retail/stores/:id/products` · `/admin/retail/stores/:id/ingest`
- **Auth**: Bearer usuario · admin retail solo ROLE_ADMIN
- **Body / Params**: `q` búsqueda · listado de productos de local con `q/page/take` · ingest sin body
- **Respuesta esperada**: `{ query, tokens, results: [{ id, name, price, description, productUrl, imageUrl, categoryName, syncedAt, store: { name, logoUrl }, priceHistory: [...] }] }`
- **Estado**: IMPLEMENTADO
- **Notas**: La UI muestra “Precios de venta encontrados” / local (tienda). La app nunca consulta la fuente externa en vivo. Cron (timezone `America/Argentina/Buenos_Aires`): **cada 5 min de 06:00 a 20:55** un batch de tiendas más viejas (`RETAIL_INGEST_DAY_BATCH`, default 8); **cada hora de 21:00 a 05:00** un batch mayor (`RETAIL_INGEST_NIGHT_BATCH`, default 20). Admin “Sincronizar todo” hace **full en background hasta terminar**; si hay un batch del cron, lo cancela al cerrar la tienda actual y encola el full. Progreso en `RetailIngestRun` (`storesDone/storesTotal`, `currentStoreName`, `heartbeatAt`). Ingesta más rápida: páginas de 100, upserts en paralelo, sin persistir `raw` del producto, historial limitado. `priceDivisor` por local corrige centavos (Multiplo). `RETAIL_INGEST_DISABLED=true` apaga el cron.

### [FEATURE] Pedido offline y compras en esquema (comercio tipo 1)
- **Método**: GET | PUT · POST | PATCH (pedidos)
- **Ruta**: `/providers/:provider/config` · `GET /my/providers` (`purchase`) · `POST /orders/offline` · `PATCH /orders/:id`
- **Auth**: Bearer, organización comercio (RETAILER) para usarlas; la config la guarda el tenant actual. Pedidos: rol que puede armar pedidos.
- **Body / Params**: config `{ acceptsOffline?, acceptsScheme?, offlineIvaAdjustment?, schemeIvaAdjustment?, schemeDiscountPercent? }`. Alta offline `{ orders: [{ provider, notes?, quoteRate?, items: [{ externalId, name, qty, unitPrice, internosAmount?, ivaPercent?, internosPercent? }] }] }`. Edición `{ notes?, items? }`.
- **Respuesta esperada**: `ProviderConfig` / `purchase` por proveedor. `POST /orders/offline` y `PATCH /orders/:id` devuelven `TenantOrder` con `channel: "OFFLINE"`, `status: "OFFLINE"`, `approvalStatus: "APPROVED"`, `editable: true`.
- **Estado**: IMPLEMENTADO
- **Notas**: Offline = compra sin facturar (antes “.com”); **no se llama al portal del proveedor**. Sí se registra en Nodo como pedido **aprobado** y se puede editar (cantidades, precio, notas) si el vendedor cambia algo. El mensaje al vendedor se copia aparte. **Sin percepciones (IIBB); internos sí.** Esquema = facturado, con % extra que carga el comercio una vez por distribuidor (no aplica a ítems sueltos del carrito online); al portal los ítems van sueltos. El IVA de offline y el de esquema son independientes. Si offline está activo, `offlineIvaAdjustment` es obligatorio; si esquema está activo, `schemeIvaAdjustment` es obligatorio. Si el proveedor no informa alícuota de IVA (p. ej. Ceven), offline/esquema quedan deshabilitados: no se inventa 21%, 0% ni 10,5%. Aprobar un pedido offline está bloqueado: no hay envío al portal.

## Pendiente (futuro)


### [FEATURE] Upload de imágenes (assets)
- **Método**: POST
- **Ruta**: `/assets/upload`
- **Auth**: Bearer token requerido (cualquier usuario autenticado)
- **Body / Params**: `multipart/form-data` con campo `file` (imagen JPEG, PNG, WebP, GIF o SVG, máx. 5 MB)
- **Respuesta esperada**: `{ url: "/uploads/<uuid>.ext" }`
- **Estado**: IMPLEMENTADO
- **Notas**: Los archivos se sirven en `GET /uploads/<filename>` (público, sin auth). Banners y logos aceptan URL externa o path `/uploads/...`.
