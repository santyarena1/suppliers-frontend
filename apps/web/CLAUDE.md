@AGENTS.md

# CLAUDE — Contexto del proyecto

## ROL: SOLO FRONTEND

**Este repo es únicamente el frontend.** El backend lo desarrolla otra persona.

### Lo que SÍ hacemos aquí
- Componentes React/Next.js
- Páginas, rutas, layouts
- Estado del cliente (Context, hooks)
- Consumo de APIs ya existentes en el backend
- UI/UX, estilos con Tailwind
- Lógica de presentación

### Lo que NO hacemos aquí
- Lógica de negocio del servidor
- Endpoints, controladores, servicios
- Base de datos, migraciones
- Autenticación del lado del servidor
- Sincronización con proveedores

---

## REGLA OBLIGATORIA: documentar pedidos al backend

Cada vez que una feature del frontend requiera que el backend exponga o modifique algo, **se debe agregar una entrada en `API_CONTRACT.md`** antes de considerarla completa.

El formato de cada pedido es:

```
### [FEATURE] Nombre de la feature
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: /ruta/exacta
- **Auth**: Bearer token requerido / no requerido
- **Body / Params**: descripción de lo que se envía
- **Respuesta esperada**: estructura JSON que el frontend va a consumir
- **Estado**: PENDIENTE | IMPLEMENTADO
- **Notas**: cualquier detalle adicional
```

No avanzar con la implementación frontend de una feature que dependa de un endpoint inexistente sin antes documentarlo en `API_CONTRACT.md`.

---

## Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: React 19 + Tailwind CSS 3
- **HTTP**: Axios — cliente en `lib/api.ts`
- **Base URL**: `NEXT_PUBLIC_API_URL` (default: `http://localhost:8080`)
- **Auth**: JWT Bearer token guardado en `localStorage`

## Estructura del proyecto

```
app/
  login/          — autenticación
  register/       — registro de usuario
  search/         — búsqueda de productos por proveedor
  product/        — detalle de producto
  cart/           — carrito
  configuracion/  — apariencia, preferencias y ajustes generales del sistema
  admin/          — administración (orgs, usuarios, permisos, locales, diagnóstico)
  credentials/    — credenciales por proveedor
  diagnostics/    — redirect a /admin?tab=diagnostics
  api/            — route handlers de Next.js (proxies o utilidades)
components/
  Navbar.tsx
  ProductCard.tsx
  AuthGuard.tsx
  PrefsPanel.tsx
  PriceTag.tsx
  AddToCartButton.tsx
lib/
  api.ts          — cliente Axios + tipos + todas las llamadas al backend
  auth.ts         — helpers de autenticación
  cart.tsx        — contexto del carrito
  prefs.tsx       — preferencias del usuario
  results.tsx     — contexto de resultados de búsqueda
  theme.tsx       — contexto de tema
```

## Proveedores soportados

NEW_BYTES, ELIT, GRUPO_NUCLEO, AIR, NEW_TREE, INVID, GC, POLYTECH, ASHIR, HDC, SOLUTION_BOX, DISTECNA, CEVEN, DIAPSTORE

## Endpoints actuales del backend (documentados en `lib/api.ts`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /auth/login | Login → JWT |
| POST | /auth/register | Registro |
| GET | /search/provider/:provider?name= | Búsqueda por proveedor |
| GET | /credentials/me | Credenciales del usuario |
| GET | /credentials/:providerName | Credencial de un proveedor |
| POST | /credentials | Guardar credencial |
| DELETE | /credentials/:providerName | Eliminar credencial |
| PUT | /user/update-active-status | Admin: activar/desactivar usuario |
| PUT | /user/update-end-date | Admin: cambiar fecha de vencimiento |
| DELETE | /user/delete | Admin: eliminar usuario |
| GET | /sync/invid/:userId | Sincronizar INVID |
| GET | /sync/invid/search/:title | Buscar en INVID local |
