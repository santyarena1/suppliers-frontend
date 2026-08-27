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

### [FEATURE] Alta pública de comercio
- **Método**: POST
- **Ruta**: `/auth/register`
- **Auth**: pública (rate limit)
- **Body / Params**: `{ commerceName, username, email, password? }`
- **Respuesta esperada**: `{ token, generatedPassword? }` — entra directo. Si no mandó contraseña, se genera y se muestra una sola vez.
- **Estado**: IMPLEMENTADO
- **Notas**: Crea la organización `RETAILER`, el usuario y la membresía `ADMIN`. El nombre del local choca en castellano: “Ya existe un comercio con ese nombre”.

### [FEATURE] Panel del comercio (perfil, equipo, tilde del comprador)
- **Método**: GET | PUT | POST
- **Ruta**: `/my/commerce`, `/my/commerce/orders`, `/my/team`, `/my/team/:membershipId`
- **Auth**: Bearer con organización · editar, solo ADMIN (u OWNER residual)
- **Body / Params**: perfil `{ name?, contactEmail?, contactPhone? }` · tilde `{ buyerCanConfirm }` · invitar `{ username, email, role, title? }`
- **Respuesta esperada**: perfil con `{ id, name, type, contactEmail, contactPhone, buyerCanConfirm, role }` · equipo como lista de miembros · al invitar, `generatedPassword` una sola vez
- **Estado**: IMPLEMENTADO
- **Notas**: El tilde se lee de la base al confirmar un pedido, no del JWT. Un comercio no puede quedar sin administrador activo. Roles de pantalla: Administrador, Comprador, Vendedor, Solo lectura. Nunca “Dueño”.

### [FEATURE] Carrito compartido del local
- **Método**: GET | POST | PATCH | DELETE
- **Ruta**: `/cart`, `/cart/items`, `/cart/items/:id`
- **Auth**: Bearer con organización · mutar, quien puede pedir (`ADMIN`, `BUYER`, `SELLER`)
- **Body / Params**: alta `{ provider, externalId, name, price, imageUrl, quantity?, snapshot? }` · `DELETE /cart?provider=` vacía un proveedor
- **Respuesta esperada**: ítems `{ id, provider, externalId, name, price, imageUrl, quantity, snapshot }`
- **Estado**: IMPLEMENTADO
- **Notas**: Un carrito por comercio, no por persona. `VIEWER` puede GET, no muta. El superadmin de prueba opera el Comercio de Pruebas y comparte ese carrito.

### [FEATURE] Proveedores visibles y canje de código de vinculación
- **Método**: GET | POST
- **Ruta**: `/my/providers`, `/my/redeem-code`
- **Auth**: Bearer usuario con organización · canje, solo ADMIN
- **Body / Params**: canje `{ code }`
- **Respuesta esperada**: `VisibleProvider[]` con `{ provider, name, linked, advertised, accountManager, hasCredentials }` · canje `{ linkId, tenantName, tenantType, provider }` recién después de canjear
- **Estado**: IMPLEMENTADO
- **Notas**: `/my/providers` es la única fuente de qué proveedores existen para un comercio. No incluye `discountPercent` (eso es del distribuidor). Todos los rechazos del canje responden lo mismo para que no se puedan enumerar códigos ni organizaciones. En el celular el comercio puede escanear el QR; el código lo genera el mayorista.

### [FEATURE] Pedidos de la organización y aprobación
- **Método**: GET | POST
- **Ruta**: `/orders`, `/orders/pending-approval`, `/orders/:id/approve`, `/orders/:id/reject`
- **Auth**: Bearer usuario con organización · aprobar y rechazar, solo ADMIN (u OWNER residual)
- **Body / Params**: rechazo `{ reason? }`
- **Respuesta esperada**: pedido con `{ id, provider, providerName, status, approvalStatus, createdBy, approvedBy, total, items }` · `/orders/pending-approval` devuelve `{ canApprove, needsApproval, orders }`
- **Estado**: IMPLEMENTADO
- **Notas**: Un vendedor que confirma un checkout recibe `status: "PENDING_APPROVAL"` y el pedido no se manda al proveedor. El comprador confirma solo si `buyerCanConfirm` está prendido en el local (se lee de la base, no del token). Al aprobarlo se reenvía el borrador guardado tal cual. Ver `docs/PLAN_TIPO1.md`.

### [FEATURE] Cartera del distribuidor
- **Método**: GET | PUT
- **Ruta**: `/my/clients`, `/my/clients/:linkId`, `/my/client-orders`, `/my/clients/:linkId/orders`
- **Auth**: Bearer con organización `DISTRIBUTOR` · vendedor, solo sus clientes · Product Manager, todos en solo lectura
- **Body / Params**: `{ accountManagerId?, discountPercent?, notes? }`
- **Respuesta esperada**: lista con `{ linkId, commerce, accountManager, discountPercent, orderSummary }` · pedidos `{ commerceName, status, approvalStatus, itemsCount, createdAt }`
- **Estado**: IMPLEMENTADO
- **Notas**: NODO para el mayorista es cartera y su catálogo, no para comprarle a otras integraciones. El descuento de cuenta se aplica al precio que lee el comercio; el local no ve el porcentaje. El Product Manager ve todos los clientes y el vendedor de cada uno; no edita ni entra al chat. Ver `docs/PLAN_TIPO2.md`.

### [FEATURE] Códigos de vinculación del mayorista
- **Método**: GET | POST | DELETE
- **Ruta**: `/my/access-codes`, `/my/access-codes/:codeId`
- **Auth**: Bearer · Gerente o Administrador del distribuidor (o marca)
- **Body / Params**: alta `{ label?, maxUses?, expiresInDays? }`
- **Respuesta esperada**: `{ id, code, label, maxUses, usedCount, expiresAt, revoked, redemptions: [{ commerceName, redeemedAt }] }`
- **Estado**: IMPLEMENTADO
- **Notas**: El QR en pantalla es el mismo código escrito. El canje sigue sin revelar el origen hasta completarse. DELETE revoca.

### [FEATURE] Publicidad del distribuidor
- **Método**: PUT
- **Ruta**: `/my/advertising`
- **Auth**: Bearer · Gerente o Administrador
- **Body / Params**: `{ advertisingEnabled }`
- **Respuesta esperada**: `{ advertisingEnabled }`
- **Estado**: IMPLEMENTADO
- **Notas**: Es el tilde que ya usaba el descubrimiento cerrado. Sin él, un comercio no vinculado no sabe que el mayorista existe.

### [FEATURE] Chat del vínculo
- **Método**: GET | POST
- **Ruta**: `/my/chats`, `/my/chats/:linkId`
- **Auth**: Bearer con organización (comercio o distribuidor)
- **Body / Params**: `{ body }` (máx. 2000)
- **Respuesta esperada**: hilos `{ linkId, otherName, lastMessage }` · mensajes `{ id, body, mine, sender, createdAt }`
- **Estado**: IMPLEMENTADO
- **Notas**: Un hilo por `TenantLink`. El vendedor del mayorista solo entra a los de *sus* clientes. Solo lectura mira, no escribe. El Product Manager no entra.

### [FEATURE] Catálogo propio del distribuidor
- **Método**: GET
- **Ruta**: `/search/provider/:provider`, `/catalog/categories`, `/catalog/featured`, `/catalog/by-category`, `/providers/:provider/products/:externalId`
- **Auth**: Bearer con organización `DISTRIBUTOR`
- **Body / Params**: búsqueda `?name=`
- **Respuesta esperada**: fichas de `ProviderSyncCache` de **su** `providerKey`. Otro proveedor → `[]`. Product Manager, solo sus marcas; sin marcas, vacío.
- **Estado**: IMPLEMENTADO
- **Notas**: Sin carrito. El mayorista ve precio de lista. El comercio ve cuenta + marca + markup al leer. Ver `docs/PLAN_TIPO2.md`.

### [FEATURE] Product Manager y descuentos por marca
- **Método**: GET | PUT | POST
- **Ruta**: `/my/team`, `/my/team/:membershipId/brands`, `/my/catalog-brands`, `/my/managed-brands`, `/my/brand-discounts`, `/my/discount-clients`
- **Auth**: Bearer · invitar y asignar marcas, Gerente o Administrador · descuentos, también Product Manager (solo las suyas)
- **Body / Params**: invitar `{ username, email, role, title? }` · marcas `{ brandNames }` · descuento `{ brandName, discountPercent, appliesToAll?, clientTenantIds? }`
- **Respuesta esperada**: equipo con `managedBrands` · descuentos `{ brandName, discountPercent, appliesToAll, clients: [{ id, name }] }` · locales `{ id, name }[]`
- **Estado**: IMPLEMENTADO
- **Notas**: `appliesToAll: true` es la lista general. `false` exige al menos un comercio vinculado. El Product Manager ve la cartera completa (quién vende a cada local) para asignar descuentos; no edita vendedor ni descuento de cuenta. El comercio no ve el porcentaje. Fórmula: `crudo * (1 - cuenta/100) * (1 - marca/100) * (1 + markup/100)`.

## Pendiente (futuro)


### [FEATURE] Upload de imágenes para banners
- **Método**: POST
- **Ruta**: `/admin/banners/upload`
- **Auth**: Bearer admin
- **Body / Params**: `multipart file`
- **Respuesta esperada**: `{ imageUrl: string }`
- **Estado**: PENDIENTE
- **Notas**: Hoy los banners usan URL externa de imagen.
