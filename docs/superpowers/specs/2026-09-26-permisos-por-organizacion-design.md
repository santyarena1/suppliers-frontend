# Permisos configurables por organización

Estado: implementado (2026-09-27). Los permisos de precios quedan para una segunda etapa.

## Problema

Qué puede hacer cada persona dentro de su organización está fijo en código
(`TENANT_ROLES_CAN_*` en `packages/shared/src/tenants.ts`): "el comprador pide",
"solo dueño o admin aprueba". El dueño no puede ajustarlo. Además hay acciones sin
ningún chequeo: **credenciales de proveedor** (cualquier miembro, incluso "Solo
lectura", puede crearlas, editarlas o borrarlas) y **crear proveedor por lista**
(se controla por tipo de organización, no por rol).

## Decisiones

- El dueño ajusta **por rol** y, si hace falta, **por persona** (excepción).
- El dueño puede prender o apagar **cualquier** permiso del catálogo.
- Los valores por defecto de cada rol reproducen exactamente el comportamiento de
  hoy: nadie gana ni pierde permisos al desplegar.
- Reglas fijas (no configurables), para que nadie se bloquee ni se autoescale:
  - El **Dueño** tiene siempre todos los permisos.
  - Solo un Dueño edita permisos y toca a otro Dueño.
  - Nunca puede quedar una organización sin Dueño activo.
- El superadmin puede ver y editar los permisos de cualquier organización desde el
  Directorio.

## Catálogo de permisos

`packages/shared/src/permissions.ts`: clave, grupo, etiqueta, descripción y tipos de
organización a los que aplica.

| Grupo | Clave | Qué habilita | Aplica a |
|---|---|---|---|
| Pedidos | `orders.create` | Armar carrito y enviar pedidos | Comercio, Distribuidor |
| Pedidos | `orders.confirm` | Confirmar sin aprobación de otro | Comercio, Distribuidor |
| Pedidos | `orders.approve` | Aprobar pedidos armados por otros | Comercio, Distribuidor |
| Proveedores | `providers.manage` | Credenciales, alta/baja, listas, configuración (incluye márgenes) y sync | Todos |
| Proveedores | `providers.account` | Cuenta corriente y pagos con proveedores | Comercio, Distribuidor |
| Proveedores | `catalog.purge` | Vaciar catálogo de un proveedor | Comercio, Distribuidor |
| Equipo | `team.manage` | Invitar, quitar y cambiar rol de miembros | Todos |
| Equipo | `codes.manage` | Códigos de vinculación | Distribuidor, Marca |
| Chat | `chat.write` | Escribir en el chat con proveedores/clientes | Todos |
| Cartera | `portfolio.view_all` | Ver toda la cartera (si no, solo sus cuentas) | Distribuidor, Marca |
| Cartera | `portfolio.manage` | Asignar vendedor, suspender vínculos | Distribuidor, Marca |
| Cartera | `portfolio.edit_terms` | Condiciones comerciales de un cliente | Distribuidor |
| Marca | `brand.manage` | Acciones, catálogo y recursos de marca (defecto: también Marketing y Comercial) | Marca |
| Publicidad | `ads.manage` | Prender y gestionar publicidad | Todos |

### Valores por defecto (= hoy)

- **Dueño / Administrador**: todos.
- **Comercio · Comprador**: `orders.create`, `orders.confirm`, `chat.write`.
- **Comercio · Vendedor**: `orders.create`.
- **Distribuidor · Vendedor**: `orders.create`, `chat.write`, `portfolio.edit_terms` (cartera: solo sus cuentas).
- **Distribuidor · Product Manager**: `chat.write`.
- **Marca · Marketing / Comercial**: `chat.write`, `brand.manage` (Comercial: chat solo con su cuenta asignada, regla fija).
- `providers.manage`: solo Dueño y Administrador (antes nadie lo chequeaba: arreglo del agujero de credenciales).
- `providers.account`: todos los roles (como antes); el dueño puede restringirlo.
- Test de equivalencia en `apps/api/src/tenants/permissions.spec.ts`.

## Modelo de datos

```prisma
model TenantRolePermission {        // excepción por rol dentro de una org
  tenantId   String
  role       TenantRole
  permission String
  allowed    Boolean
  @@id([tenantId, role, permission])
}

model TenantMemberPermission {      // excepción por persona
  membershipId String
  permission   String
  allowed      Boolean
  @@id([membershipId, permission])
}
```

Resolución: Dueño → todo. Si no: excepción de la persona > excepción del rol >
valor por defecto del rol. Solo se guardan las diferencias: "volver al valor del
rol" borra la fila.

## Backend

- `TenantContextService.forUser` resuelve y agrega `permissions: PermissionKey[]` al
  `TenantContext` (ya consulta la base en cada request; suma dos lecturas chicas).
- `assertPermission(tenant, key)` reemplaza a `assertTenantRole(tenant, TENANT_ROLES_CAN_*)`
  en todos los puntos del inventario (pedidos, aprobación, vaciar catálogo, equipo,
  códigos, cartera, marca, publicidad, chat).
- Se agrega el chequeo que falta en credenciales, proveedores por lista y
  configuración/sync de proveedores (`providers.manage`).
- Endpoints:
  - `GET /my/permissions` → claves efectivas de la sesión.
  - `GET /my/team/permissions` → catálogo aplicable + matriz rol × permiso + excepciones por miembro.
  - `PUT /my/team/roles/:role/permissions` `{ [key]: true | false | null }` (null = volver al defecto). Solo Dueño.
  - `PUT /my/team/members/:membershipId/permissions` ídem. Solo Dueño.
  - Espejo para superadmin: `/admin/tenants/:id/permissions*`.

## Frontend

- `useCan(key)` (cacheado como `useMyModules`) para ocultar/deshabilitar acciones; el
  servidor igual corta.
- **Equipo → Permisos**: tabla por grupos (filas = permisos, columnas = roles), con
  interruptores; Dueño fijo en "sí". Marca visual cuando un valor difiere del defecto
  y "Restablecer".
- **Equipo → persona → Permisos**: mismos interruptores con tres estados (según rol /
  sí / no).
- Directorio (superadmin): la misma vista dentro de la ficha de la organización.

## Pruebas

- Unitarias de la resolución (defecto, excepción de rol, de persona, Dueño siempre todo).
- Por cada punto migrado: un test que corte sin el permiso y pase con él.
- Test de equivalencia: con cero excepciones, cada rol de cada tipo resuelve
  exactamente lo que devolvían las constantes viejas.

## Segunda etapa

- `prices.view_cost`: **descartado por ahora (2026-09-29)**. Nadie lo pidió y el costo
  viaja por muchos caminos; un recorte parcial daría falsa seguridad. Si se retoma:
  - Dónde viaja el costo: catálogo, búsqueda y ficha (`toProductView` / `toSheetView`
    en `apps/api/src/providers/catalog-view.ts`, más `withPriceDropMeta` y
    `getFeatured`), historial de precios, sync runs e importaciones de listas (diffs
    de precio), carrito (`/cart/org` y el evento `cart_updated` por websocket),
    pedidos (`OrderApprovalService.serialize`), analítica (`/orders/insights`),
    checkout y borradores por proveedor, y mensajes de chat de tipo pedido.
  - Decisión pendiente: qué ve quien no ve costo pero arma pedidos. Lo más simple
    sería un recálculo del carrito: se muestra el precio con el margen del comercio
    (`ProviderSyncConfig.priceMarkupPercent`) en lugar del costo.
  - En el front, un precio `null` hoy significa "sin sincronizar" y bloquea la compra:
    usar una bandera explícita (`costHidden`) en lugar de `null`.

## Fuera de alcance

- Permisos por proveedor puntual (ej. "Juan solo pide a Elit").
- Módulos del menú por usuario (se quitaron en 1a; el menú sale de los permisos).
