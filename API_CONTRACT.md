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

## Pendiente (futuro)

### [FEATURE] Upload de imágenes para banners
- **Método**: POST
- **Ruta**: `/admin/banners/upload`
- **Auth**: Bearer admin
- **Body / Params**: `multipart file`
- **Respuesta esperada**: `{ imageUrl: string }`
- **Estado**: PENDIENTE
- **Notas**: Hoy los banners usan URL externa de imagen.
