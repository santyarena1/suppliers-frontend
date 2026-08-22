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
- **Body / Params**: crear `{ username, email, password, role, brandId?, active?, endDate? }` · editar `{ username?, email?, brandId? }` · password `{ password }` (mín. 8)
- **Respuesta esperada**: lista enriquecida con `brand`, `providers` (nombres, sin secretos), `brandAccesses`
- **Estado**: IMPLEMENTADO
- **Notas**: `GET /admin/users` no devuelve hashes ni credenciales de distribuidores. `endDate: null` limpia el vencimiento.

### [FEATURE] Árbol de organizaciones (multi-tenant)
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: `/admin/tenants`, `/admin/tenants/:id`, `/admin/tenants/:id/members`, `/admin/tenants/:id/members/new-user`, `/admin/tenants/members/:membershipId`, `/admin/tenants/members/:membershipId/managed-brands`, `/admin/tenants/links`, `/admin/tenants/links/:linkId`, `/admin/tenants/:id/access-codes`, `/admin/tenants/access-codes/:codeId`, `/admin/tenants/users/:userId/relations`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**: organización `{ name, type: "RETAILER" | "DISTRIBUTOR" | "BRAND", providerKey?, brandId?, contactEmail?, contactPhone?, notes?, advertisingEnabled?, active? }` · membresía `{ userId | (username, email, password), role, title? }` · vínculo `{ clientTenantId, supplierTenantId, accountManagerId?, status?, discountPercent?, notes? }` · código `{ label?, maxUses?, expiresInDays? }`
- **Respuesta esperada**: `GET /admin/tenants` devuelve `{ tenants: TenantNode[], unassignedUsers: [] }`, cada `TenantNode` con `members`, `suppliers`, `clients` y `accessCodes`
- **Estado**: IMPLEMENTADO
- **Notas**: `tenantRole` es el alcance dentro de la organización y `platformRole` el nivel de acceso a Nodo. El lado cliente de un vínculo siempre es un comercio. Ver `docs/ARQUITECTURA_TENANTS.md`.

## Pendiente (futuro)

### [FEATURE] Canje de código de vinculación por el comercio
- **Método**: POST
- **Ruta**: `/tenants/redeem-code`
- **Auth**: Bearer usuario del comercio
- **Body / Params**: `{ code }`
- **Respuesta esperada**: `{ tenantName, type }` recién después del canje
- **Estado**: PENDIENTE
- **Notas**: No debe revelar la organización de origen antes de canjear, ni permitir enumerar códigos.

### [FEATURE] Aprobación de órdenes del comercio
- **Método**: GET | PUT
- **Ruta**: `/orders/pending-approval`, `/orders/:id/approval`
- **Auth**: Bearer OWNER o ADMIN del comercio
- **Body / Params**: `{ decision: "APPROVED" | "REJECTED" }`
- **Respuesta esperada**: orden con `approvalStatus`, `createdByUserId`, `approvedByUserId`
- **Estado**: PENDIENTE
- **Notas**: Las columnas ya existen en `ProviderOrder`; falta el flujo end to end.


### [FEATURE] Upload de imágenes para banners
- **Método**: POST
- **Ruta**: `/admin/banners/upload`
- **Auth**: Bearer admin
- **Body / Params**: `multipart file`
- **Respuesta esperada**: `{ imageUrl: string }`
- **Estado**: PENDIENTE
- **Notas**: Hoy los banners usan URL externa de imagen.
