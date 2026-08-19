# API Contract — Pedidos al Backend

> Este archivo documenta todos los endpoints que el frontend necesita del backend.
> El dev de backend debe revisar este archivo para saber qué implementar.
>
> Estados posibles: **PENDIENTE** | **IMPLEMENTADO** | **EN REVISIÓN**

---

## Endpoints ya implementados (referencia)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/login` | No | Login → devuelve `{ success, data: { token } }` |
| POST | `/auth/register` | No | Registro → devuelve `{ success, data: { id, username, role } }` |
| GET | `/search/provider/:provider` | Bearer | Búsqueda por proveedor. Query param: `name`. Devuelve `ProductDTO[]` |
| GET | `/credentials/me` | Bearer | Lista todas las credenciales del usuario autenticado |
| GET | `/credentials/:providerName` | Bearer | Credencial de un proveedor específico |
| POST | `/credentials` | Bearer | Guardar/actualizar credencial. Body: `{ providerName, credentials }` |
| DELETE | `/credentials/:providerName` | Bearer | Eliminar credencial de un proveedor |
| PUT | `/user/update-active-status` | Bearer (Admin) | Activar/desactivar usuario. Body: `{ userId, active }` |
| PUT | `/user/update-end-date` | Bearer (Admin) | Cambiar fecha de vencimiento. Body: `{ userId, endDate }` |
| DELETE | `/user/delete` | Bearer (Admin) | Eliminar usuario. Body: `{ userId }` |
| GET | `/sync/invid/:userId` | Bearer | Sincronizar catálogo INVID para un usuario |
| GET | `/sync/invid/search/:title` | Bearer | Buscar en el catálogo INVID local |

---

## Cambios requeridos en autenticación existente

### [AUTH] Extensión JWT y registro con email
- **Método**: POST (modificar existentes)
- **Rutas**: `/auth/login`, `/auth/register`
- **Auth**: No
- **Body / Params**:
  - Registro debe aceptar `email` además de `username` y `password`
  - Si el email tiene invitación pendiente de marca, vincular automáticamente al registrarse
- **Respuesta esperada**: JWT payload debe incluir:
  ```json
  {
    "sub": "username",
    "userId": "uuid",
    "role": "ROLE_USER | ROLE_ADMIN | ROLE_BRAND",
    "email": "user@example.com",
    "brandId": "uuid-solo-si-ROLE_BRAND"
  }
  ```
- **Estado**: PENDIENTE
- **Notas**: Nuevo rol `ROLE_BRAND` para cuentas de marca. El frontend guarda `email` y `brandId` en sesión.

---

## Módulo de Marcas — Portal Usuario (ROLE_USER)

> **Regla de seguridad crítica**: Ningún endpoint de este grupo debe devolver marcas no autorizadas.
> Validar acceso activo marca-usuario en cada request con `brandId`.

### [MARCAS] Dashboard del usuario
- **Método**: GET
- **Ruta**: `/marcas/dashboard`
- **Auth**: Bearer (ROLE_USER)
- **Respuesta esperada**:
  ```json
  {
    "success": true,
    "data": {
      "authorizedBrands": [BrandAccess],
      "recentAlerts": [BrandNotification],
      "upcomingIncoming": [BrandNews],
      "favoriteChanges": [{ "product": BrandProduct, "oldStatus": "LOW_STOCK", "newStatus": "OUT_OF_STOCK" }],
      "activeCampaigns": [BrandCampaign],
      "recentNews": [BrandNews],
      "newMaterials": [BrandMaterial],
      "importantDiscontinued": [BrandProduct],
      "unreadNotifications": 3
    }
  }
  ```
- **Estado**: PENDIENTE

### [MARCAS] Listar marcas autorizadas
- **Método**: GET
- **Ruta**: `/marcas/authorized`
- **Auth**: Bearer (ROLE_USER)
- **Respuesta esperada**: `{ success, data: BrandAccess[] }` — solo accesos ACTIVE o ACCEPTED
- **Estado**: PENDIENTE
- **Notas**: NO debe existir endpoint de listado público de marcas.

### [MARCAS] Detalle de marca autorizada
- **Método**: GET
- **Ruta**: `/marcas/:brandId`
- **Auth**: Bearer (ROLE_USER) + acceso activo a brandId
- **Respuesta esperada**: `{ success, data: BrandAccount }`
- **Estado**: PENDIENTE
- **Notas**: 403 si no hay relación activa. 404 genérico para evitar enumeración.

### [MARCAS] Productos de marca
- **Método**: GET
- **Ruta**: `/marcas/:brandId/products`
- **Auth**: Bearer + acceso activo
- **Params**: `search`, `categoryId`, `subcategoryId`, `discontinued`, `recommended`, `isLaunch`, `tag`, `page`, `pageSize`
- **Respuesta esperada**: `{ success, data: { items: BrandProduct[], total, page, pageSize } }`
- **Estado**: PENDIENTE

### [MARCAS] Mapa de disponibilidad
- **Método**: GET
- **Ruta**: `/marcas/:brandId/availability`
- **Auth**: Bearer + acceso activo
- **Params**: `search`, `distributorId`, `categoryId`, `status`, `tag`
- **Respuesta esperada**:
  ```json
  {
    "success": true,
    "data": {
      "products": [BrandProduct],
      "matrix": [ProductAvailability]
    }
  }
  ```
- **Estado**: PENDIENTE

### [MARCAS] Comparar disponibilidad por producto
- **Método**: GET
- **Ruta**: `/marcas/:brandId/products/:productId/availability`
- **Auth**: Bearer + acceso activo
- **Respuesta esperada**: `{ success, data: ProductAvailability[] }`
- **Estado**: PENDIENTE

### [MARCAS] Exportar disponibilidad
- **Método**: GET
- **Ruta**: `/marcas/:brandId/availability/export`
- **Auth**: Bearer + acceso activo
- **Respuesta esperada**: archivo Excel (.xlsx)
- **Estado**: PENDIENTE

### [MARCAS] Feed de novedades
- **Método**: GET
- **Ruta**: `/marcas/news`
- **Auth**: Bearer (ROLE_USER)
- **Params**: `brandId`, `type`, `page`, `pageSize`
- **Respuesta esperada**: `{ success, data: { items: BrandNews[], total, page, pageSize } }`
- **Estado**: PENDIENTE
- **Notas**: Solo novedades de marcas autorizadas y visibles para el usuario.

### [MARCAS] Campañas activas
- **Método**: GET
- **Ruta**: `/marcas/campaigns`
- **Auth**: Bearer (ROLE_USER)
- **Params**: `brandId` (opcional)
- **Respuesta esperada**: `{ success, data: BrandCampaign[] }`
- **Estado**: PENDIENTE

### [MARCAS] Materiales
- **Método**: GET
- **Ruta**: `/marcas/materials`
- **Auth**: Bearer (ROLE_USER)
- **Params**: `brandId`, `type`
- **Respuesta esperada**: `{ success, data: BrandMaterial[] }`
- **Estado**: PENDIENTE

### [MARCAS] Capacitaciones
- **Método**: GET
- **Ruta**: `/marcas/trainings`
- **Auth**: Bearer (ROLE_USER)
- **Params**: `brandId`
- **Respuesta esperada**: `{ success, data: BrandTraining[] }`
- **Estado**: PENDIENTE

### [MARCAS] Favoritos
- **Método**: GET
- **Ruta**: `/marcas/favorites`
- **Auth**: Bearer (ROLE_USER)
- **Respuesta esperada**: `{ success, data: BrandFavorite[] }`
- **Estado**: PENDIENTE

### [MARCAS] Agregar favorito
- **Método**: POST
- **Ruta**: `/marcas/:brandId/favorites`
- **Auth**: Bearer + acceso activo
- **Body**: `{ productId }`
- **Respuesta esperada**: `{ success, data: BrandFavorite }`
- **Estado**: PENDIENTE

### [MARCAS] Quitar favorito
- **Método**: DELETE
- **Ruta**: `/marcas/:brandId/favorites/:productId`
- **Auth**: Bearer + acceso activo
- **Estado**: PENDIENTE

### [MARCAS] Notificaciones
- **Método**: GET
- **Ruta**: `/marcas/notifications`
- **Auth**: Bearer (ROLE_USER)
- **Params**: `unreadOnly` (boolean)
- **Respuesta esperada**: `{ success, data: BrandNotification[] }`
- **Estado**: PENDIENTE

### [MARCAS] Marcar notificación leída
- **Método**: PATCH
- **Ruta**: `/marcas/notifications/:id/read`
- **Auth**: Bearer (ROLE_USER)
- **Estado**: PENDIENTE

### [MARCAS] Marcar todas leídas
- **Método**: PATCH
- **Ruta**: `/marcas/notifications/read-all`
- **Auth**: Bearer (ROLE_USER)
- **Estado**: PENDIENTE

### [MARCAS] Invitaciones pendientes
- **Método**: GET
- **Ruta**: `/marcas/invitations/pending`
- **Auth**: Bearer (ROLE_USER)
- **Respuesta esperada**: `{ success, data: BrandAccess[] }`
- **Estado**: PENDIENTE

### [MARCAS] Aceptar invitación
- **Método**: POST
- **Ruta**: `/marcas/invitations/:accessId/accept`
- **Auth**: Bearer (ROLE_USER)
- **Respuesta esperada**: `{ success, data: BrandAccess }` con status ACTIVE
- **Estado**: PENDIENTE

### [MARCAS] Rechazar invitación
- **Método**: POST
- **Ruta**: `/marcas/invitations/:accessId/reject`
- **Auth**: Bearer (ROLE_USER)
- **Respuesta esperada**: `{ success, data: BrandAccess }` con status REJECTED
- **Estado**: PENDIENTE

### [MARCAS] Fijar/ocultar marca en panel personal
- **Método**: PATCH
- **Rutas**: `/marcas/:brandId/pin`, `/marcas/:brandId/visibility`
- **Auth**: Bearer + acceso activo
- **Body**: `{ pinned: boolean }` o `{ hidden: boolean }`
- **Estado**: PENDIENTE

---

## Módulo de Marcas — Panel Marca (ROLE_BRAND)

> **Regla**: Toda operación debe validar que el JWT.brandId coincide con los recursos.

### [BRAND] Dashboard
- **Método**: GET
- **Ruta**: `/brand/dashboard`
- **Auth**: Bearer (ROLE_BRAND)
- **Respuesta esperada**: `{ success, data: BrandDashboardStats }`
- **Estado**: PENDIENTE

### [BRAND] Perfil
- **Método**: GET / PUT
- **Ruta**: `/brand/profile`
- **Auth**: Bearer (ROLE_BRAND)
- **Body (PUT)**: `{ name?, description?, commercialData?, contactEmail?, contactPhone?, website? }`
- **Respuesta esperada**: `{ success, data: BrandAccount }`
- **Estado**: PENDIENTE

### [BRAND] Subir logo
- **Método**: POST
- **Ruta**: `/brand/profile/logo`
- **Auth**: Bearer (ROLE_BRAND)
- **Body**: multipart `file` (image/*, max 2MB)
- **Respuesta esperada**: `{ success, data: { logoUrl } }`
- **Estado**: PENDIENTE

### [BRAND] CRUD Productos
- **Método**: GET / POST
- **Ruta**: `/brand/products`
- **Método**: GET / PUT / PATCH
- **Ruta**: `/brand/products/:id`
- **Método**: PATCH
- **Ruta**: `/brand/products/:id/deactivate`
- **Auth**: Bearer (ROLE_BRAND)
- **Body (POST/PUT)**: BrandProductInput (ver `lib/brands/types.ts`)
- **Respuesta esperada**: `{ success, data: BrandProduct }` o paginado
- **Estado**: PENDIENTE

### [BRAND] Historial de producto
- **Método**: GET
- **Ruta**: `/brand/products/:id/history`
- **Auth**: Bearer (ROLE_BRAND)
- **Respuesta esperada**: `{ success, data: AuditLogEntry[] }`
- **Estado**: PENDIENTE

### [BRAND] Subir imagen de producto
- **Método**: POST
- **Ruta**: `/brand/products/:id/images`
- **Auth**: Bearer (ROLE_BRAND)
- **Body**: multipart `file`
- **Estado**: PENDIENTE

### [BRAND] Mapa de disponibilidad
- **Método**: GET
- **Ruta**: `/brand/availability`
- **Auth**: Bearer (ROLE_BRAND)
- **Respuesta esperada**: `{ success, data: { products, matrix, distributors } }`
- **Estado**: PENDIENTE

### [BRAND] Actualizar disponibilidad
- **Método**: PUT
- **Rutas**: `/brand/availability`, `/brand/availability/bulk`
- **Auth**: Bearer (ROLE_BRAND)
- **Body**: AvailabilityInput o `{ items: AvailabilityInput[] }`
- **Estado**: PENDIENTE
- **Notas**: Registrar historial de cambios y disparar notificaciones a favoritos.

### [BRAND] Historial de disponibilidad
- **Método**: GET
- **Ruta**: `/brand/availability/history`
- **Auth**: Bearer (ROLE_BRAND)
- **Params**: `productId`
- **Estado**: PENDIENTE

### [BRAND] Distribuidores de la marca
- **Método**: GET / POST / PATCH
- **Rutas**: `/brand/distributors`, `/brand/distributors/:id`
- **Auth**: Bearer (ROLE_BRAND)
- **Estado**: PENDIENTE

### [BRAND] Importaciones
- **Método**: GET
- **Ruta**: `/brand/imports/template` → descarga plantilla Excel
- **Método**: POST
- **Ruta**: `/brand/imports/upload` → multipart, valida y devuelve preview
- **Método**: POST
- **Ruta**: `/brand/imports/:id/confirm` → confirma importación
- **Método**: GET
- **Ruta**: `/brand/imports`, `/brand/imports/:id`
- **Método**: GET
- **Ruta**: `/brand/imports/:id/errors` → reporte de errores CSV
- **Método**: POST
- **Ruta**: `/brand/imports/:id/revert`
- **Auth**: Bearer (ROLE_BRAND)
- **Estado**: PENDIENTE
- **Notas**: Columnas de plantilla en `lib/brands/constants.ts` → `IMPORT_TEMPLATE_COLUMNS`. Validar estados, distribuidores, SKUs duplicados. Guardar archivo original y auditoría.

### [BRAND] Usuarios autorizados e invitaciones
- **Método**: GET
- **Ruta**: `/brand/users`
- **Método**: POST
- **Rutas**: `/brand/users/invite`, `/brand/users/invite-bulk`
- **Método**: POST
- **Rutas**: `/brand/users/:accessId/resend`, `/brand/users/:accessId/revoke`
- **Auth**: Bearer (ROLE_BRAND)
- **Body invite**: `{ email, requireAcceptance?, userGroup?, userTags? }`
- **Body bulk**: `{ emails: string[], requireAcceptance? }`
- **Estado**: PENDIENTE
- **Notas**:
  - Validar email, evitar invitaciones duplicadas activas
  - Si usuario existe → crear relación; si no → enviar email de registro
  - Expirar invitaciones tras N días (configurable)
  - Estados: PENDING, INVITATION_SENT, ACCEPTED, ACTIVE, EXPIRED, REJECTED, REVOKED_BY_BRAND, BLOCKED_BY_ADMIN

### [BRAND] Novedades, campañas, materiales, capacitaciones
- **Rutas**: `/brand/news`, `/brand/campaigns`, `/brand/materials`, `/brand/trainings`
- **Auth**: Bearer (ROLE_BRAND)
- **Estado**: PENDIENTE
- **Notas**: Visibilidad por usuario (`ALL_AUTHORIZED` o `SPECIFIC_USERS`). Disparar notificaciones al publicar.

### [BRAND] Auditoría propia
- **Método**: GET
- **Ruta**: `/brand/audit`
- **Auth**: Bearer (ROLE_BRAND)
- **Params**: `entityType`, `page`
- **Estado**: PENDIENTE

### [BRAND] Estadísticas de interacción
- **Método**: GET
- **Ruta**: `/brand/stats`
- **Auth**: Bearer (ROLE_BRAND)
- **Respuesta esperada**: `{ success, data: { views, downloads, favorites, ... } }`
- **Estado**: PENDIENTE

---

## Módulo de Marcas — Admin (ROLE_ADMIN)

### [ADMIN-MARCAS] Métricas generales
- **Método**: GET
- **Ruta**: `/admin/marcas/metrics`
- **Auth**: Bearer (ROLE_ADMIN)
- **Estado**: PENDIENTE

### [ADMIN-MARCAS] CRUD Marcas
- **Método**: GET / POST
- **Ruta**: `/admin/marcas/brands`
- **Método**: PUT / PATCH / DELETE
- **Ruta**: `/admin/marcas/brands/:id`, `/admin/marcas/brands/:id/suspend`
- **Auth**: Bearer (ROLE_ADMIN)
- **Body crear**: `{ name, slug?, contactEmail, adminUsername, adminPassword, description? }`
- **Estado**: PENDIENTE
- **Notas**: Al crear marca, generar cuenta ROLE_BRAND asociada.

### [ADMIN-MARCAS] CRUD Distribuidores globales
- **Método**: GET / POST / PUT
- **Ruta**: `/admin/marcas/distributors`, `/admin/marcas/distributors/:id`
- **Auth**: Bearer (ROLE_ADMIN)
- **Estado**: PENDIENTE

### [ADMIN-MARCAS] Gestión de accesos
- **Método**: GET
- **Ruta**: `/admin/marcas/accesses`
- **Método**: PATCH / POST
- **Rutas**: `/admin/marcas/accesses/:id/block`, `/admin/marcas/accesses/:id/revoke`
- **Auth**: Bearer (ROLE_ADMIN)
- **Estado**: PENDIENTE

### [ADMIN-MARCAS] Categorías
- **Método**: GET / POST / PUT
- **Ruta**: `/admin/marcas/categories`, `/admin/marcas/categories/:id`
- **Auth**: Bearer (ROLE_ADMIN)
- **Estado**: PENDIENTE

### [ADMIN-MARCAS] Auditoría global
- **Método**: GET
- **Ruta**: `/admin/marcas/audit`
- **Auth**: Bearer (ROLE_ADMIN)
- **Params**: `brandId`, `entityType`, `page`
- **Estado**: PENDIENTE

### [ADMIN-MARCAS] Historial de importaciones
- **Método**: GET
- **Ruta**: `/admin/marcas/imports`
- **Auth**: Bearer (ROLE_ADMIN)
- **Params**: `brandId`
- **Estado**: PENDIENTE

### [ADMIN] Listar usuarios
- **Método**: GET
- **Ruta**: `/admin/users`
- **Auth**: Bearer (ROLE_ADMIN)
- **Respuesta esperada**: `{ success, data: [{ id, username, email, role, active }] }`
- **Estado**: PENDIENTE

---

## Tipos compartidos (referencia frontend)

Todos los tipos están definidos en `lib/brands/types.ts` y constantes en `lib/brands/constants.ts`.

### StockStatus (Mapa de Disponibilidad)
`HIGH_STOCK`, `MEDIUM_STOCK`, `LOW_STOCK`, `CRITICAL_STOCK`, `OUT_OF_STOCK`, `INCOMING`, `IN_TRANSIT`, `PRE_SALE`, `CONSULT`, `DISCONTINUED`, `SPOT_OFFER`, `RECOMMENDED`, `COMMERCIAL_PRIORITY`, `FEW_UNITS`, `DELAYED_ARRIVAL`, `REPLACEMENT_AVAILABLE`

### AccessStatus
`PENDING`, `INVITATION_SENT`, `ACCEPTED`, `ACTIVE`, `EXPIRED`, `REJECTED`, `REVOKED_BY_BRAND`, `BLOCKED_BY_ADMIN`

### NotificationType
`BRAND_INVITATION`, `ACCESS_ACTIVATED`, `ACCESS_REVOKED`, `NEW_LAUNCH`, `NEW_INCOMING`, `FAVORITE_STATUS_CHANGE`, `FAVORITE_DISCONTINUED`, `NEW_CAMPAIGN`, `NEW_MATERIAL`, `NEW_TRAINING`, `BRAND_ALERT`

---

## Formato estándar de respuesta

```json
{
  "success": true,
  "data": { ... },
  "message": "opcional"
}
```

Errores:
```json
{
  "success": false,
  "message": "Descripción del error",
  "errors": [{ "field": "email", "message": "..." }]
}
```

Códigos HTTP esperados:
- `403` — sin acceso a la marca
- `404` — recurso no encontrado (sin revelar existencia de marcas no autorizadas)
- `409` — invitación duplicada, SKU duplicado
- `422` — validación de importación

---

## Notificaciones (backend)

El backend debe generar notificaciones internas cuando:
- Se invita a un usuario
- Cambia estado de acceso
- Cambia disponibilidad de producto favorito
- Se publica novedad, campaña, material o capacitación
- Producto favorito se discontinúa

Envío de email requerido para:
- Invitación a usuario no registrado
- Reenvío de invitación
- (Opcional) alertas críticas configurables

---

## Seguridad (obligatorio en backend)

1. Validar ownership de marca en cada endpoint `/brand/*`
2. Validar relación activa en cada endpoint `/marcas/:brandId/*`
3. No exponer listado público de marcas
4. Sanitizar uploads (tipo, tamaño, antivirus si aplica)
5. Registrar auditoría en cambios de productos, disponibilidad, accesos, importaciones
6. Rate limit en invitaciones e importaciones
