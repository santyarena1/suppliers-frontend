# Tipo 1 autónomo y Tipo 2 — plan de producto

El aislamiento por organización ya está. Este documento es el recorte de producto:
qué puede hacer un comercio sin superadmin, qué ve un distribuidor al entrar, y
qué queda para más adelante.

## Tipo 1 — Comercio autónomo

Un `OWNER` o `ADMIN` del local no depende del árbol de superadmin para operar el día a día.

| Capacidad | Dónde | Estado |
|---|---|---|
| Buscar, carrito, checkout, aprobación, offline, tablero de compras | `/search`, `/cart`, `/pedidos`, `/proveedores` | Hecho |
| Canjear un código de vinculación | `/proveedores` (`RedeemAccessCode`) | Hecho |
| Armar y editar el equipo (alta, rol, baja, reset de clave) | `/equipo` · `GET/POST/PUT/DELETE /my/team` | Hecho |
| Contacto de la organización | `/equipo` · `PUT /my/org` | Hecho |
| Cargar credenciales de proveedor | ficha del distribuidor | Hecho |
| No entrar por URL a pantallas de Tipo 2 | `TenantRouteGate` | Hecho |
| Chat con cada distribuidor vinculado | `/mensajes` · `GET/POST /my/chat/*` | Hecho |
| Avisar un pedido al vendedor desde Pedidos | `POST /my/chat/share-order` | Hecho |
| Carrito compartido entre vendedores del mismo local (API) | `/cart/org` · SSE `cart_updated` | Hecho |

El canje sigue siendo anónimo hasta que sale bien. El alta de personas crea un usuario
nuevo en esa organización (`ROLE_USER`); no se “pesca” gente de otra org.

## Tipo 2 — Panel del distribuidor

Al entrar como `newbytes.gerente` o `elit.vendedor` la navegación **no** es la de un
comercio: no hay búsqueda ni carrito. Hay cartera. Una URL de comercio redirige al inicio.

| Capacidad | Quién | Estado |
|---|---|---|
| Inicio con resumen de clientes e inactivos | todos | Hecho |
| Listar comercios vinculados, con filtros | `SELLER` solo los asignados; el resto, todos | Hecho |
| Asignar vendedor, estado del vínculo | `OWNER` / `ADMIN` | Hecho |
| Descuento y notas del vínculo | `OWNER` / `ADMIN`, y el `SELLER` en sus cuentas | Hecho |
| Ver pedidos de esos comercios | según visibilidad de la cuenta | Hecho |
| Generar / revocar códigos (usos, vencimiento) | `OWNER` / `ADMIN` | Hecho |
| QR imprimible del código (local, sin mandar el secreto a nadie) | `OWNER` / `ADMIN` | Hecho |
| Equipo (vendedores, PM) y contacto | `OWNER` / `ADMIN` | Hecho |
| Flag de publicidad (quién puede contratar) | superadmin en la org | Hecho |
| Publicidad: espacios, precio, cupo, campañas, stats | `OWNER` / `ADMIN` del distro, si `advertisingEnabled` | Hecho · `/publicidad` |
| Product Manager: pedidos de sus marcas por defecto, opción ver todo | `PRODUCT_MANAGER` | Hecho |
| Alertas de clientes sin pedido en 30 días | todos los que ven la cuenta | Hecho |
| Chat con cada comercio de la cartera | todos los que ven la cuenta; en el comercio escriben OWNER/ADMIN/BUYER | Hecho |
| Cupos de descuento con tope, metas | — | No: ideas del plan maestro |

### Chat comercial

Un hilo entre **dos personas**, dentro de un `TenantLink`. El vendedor asignado
es el contacto por defecto al tocar “Hablar”, pero no es un buzón compartido:
el PM, el dueño y el comprador tienen conversaciones distintas. Nadie ve el
chat de un compañero.

- En la lista y el encabezado se ve **usuario + rol + organización** (los dos lados).
- El comercio escribe: dueño, administrador y comprador. El vendedor del local no.
- El distro escribe: dueño, administrador, vendedor y PM.
- `REVOKED` no se habla; `SUSPENDED` sí.
- Tiempo real por SSE (`GET /my/chat/stream?token=`). Con `REDIS_URL` el hub
  publica a las otras réplicas.
- Pedidos de NODO se anuncian en el hilo de quien armó el pedido con el vendedor asignado.
- Adjuntos: foto, PDF, Excel, hasta 10 MB. Enter envía; Shift+Enter baja de línea.

### Camino que se implementó

1. Endpoints `/my/*` (org, team, access-codes, clients, chat) con el `TenantRole` de la sesión.
2. Nav derivada de `tenantType` / `tenantRole`, no de `User.role`.
3. Home distinta para `DISTRIBUTOR`, más `/pedidos` de cartera y `/mensajes`.
4. Guardas de ruta: un comercio no entra a `/clientes`; un distribuidor no entra a `/search`.
5. El superadmin sigue viendo el árbol; para usar el panel Tipo 2 se entra como esa persona.

### Qué vendría después (prioridad)

1. Reconstruir Tipo 3 (marcas) sobre este mismo modelo. El módulo `/marca` actual no aplica.
   Ver `docs/PLAN_TIPO3.md`.
2. Cupos de descuento por vendedor y metas (si el producto lo pide).
3. Facturación de publicidad (hoy el resumen a pagar es interno; el cobro es fuera de NODO).

## Verificación

```bash
API_URL=... ADMIN_PASSWORD=... node scripts/check-tipo1-team.mjs
API_URL=... ADMIN_PASSWORD=... node scripts/check-distributor-portfolio.mjs
```
