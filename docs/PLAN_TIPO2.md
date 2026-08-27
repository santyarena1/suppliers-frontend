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
| Carrito compartido entre vendedores del mismo local (API, no navegador) | — | Pendiente |

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
| Flag de publicidad (descubrimiento sin vínculo) | `OWNER` / `ADMIN` | Hecho (flag, no cobro) |
| Product Manager: pedidos solo de sus marcas | `PRODUCT_MANAGER` | Hecho (ítem o catálogo) |
| Alertas de clientes sin pedido en 30 días | todos los que ven la cuenta | Hecho |
| Chat con cada comercio de la cartera | todos los que ven la cuenta; `VIEWER` solo lee | Hecho |
| Cupos de descuento con tope, metas | — | No: ideas del plan maestro |
| Publicidad con vigencia y slot | — | Fase 8 |

### Chat comercial

Un hilo por `TenantLink`. La historia es de las dos organizaciones: si el vendedor
cambia, el hilo queda y NODO avisa en el chat. No hay DMs persona a persona.

- El comercio ve un hilo por distribuidor vinculado. El vendedor del distro solo
  las cuentas asignadas. `REVOKED` no se habla; `SUSPENDED` sí.
- Tiempo real por SSE (`GET /my/chat/stream?token=`), no leídos, typing, visto,
  presencia, reacciones, pines, editar 15 min, borrar (autor u OWNER/ADMIN).
- Pedidos de NODO se anuncian solos. El comercio también puede “Avisar al vendedor”.
- Adjuntos: foto, PDF, Excel, hasta 10 MB. Enter envía; Shift+Enter baja de línea.

### Camino que se implementó

1. Endpoints `/my/*` (org, team, access-codes, clients, chat) con el `TenantRole` de la sesión.
2. Nav derivada de `tenantType` / `tenantRole`, no de `User.role`.
3. Home distinta para `DISTRIBUTOR`, más `/pedidos` de cartera y `/mensajes`.
4. Guardas de ruta: un comercio no entra a `/clientes`; un distribuidor no entra a `/search`.
5. El superadmin sigue viendo el árbol; para usar el panel Tipo 2 se entra como esa persona.

### Qué vendría después (prioridad)

1. Mudar el carrito de la web al de la API, para que dos vendedores del mismo local no se pisen.
2. Publicidad con vigencia y slot, no solo el boolean.
3. Reconstruir Tipo 3 (marcas) sobre este mismo modelo. El módulo `/marca` actual no aplica.
   Ver `docs/PLAN_TIPO3.md`.
4. Cupos de descuento por vendedor y metas (si el producto lo pide).

## Verificación

```bash
API_URL=... ADMIN_PASSWORD=... node scripts/check-tipo1-team.mjs
API_URL=... ADMIN_PASSWORD=... node scripts/check-distributor-portfolio.mjs
```
