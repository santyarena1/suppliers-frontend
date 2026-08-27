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
| Equipo (vendedores, PM) y contacto | `OWNER` / `ADMIN` | Hecho |
| Flag de publicidad (descubrimiento sin vínculo) | `OWNER` / `ADMIN` | Hecho (flag, no cobro) |
| Product Manager: pedidos solo de sus marcas | `PRODUCT_MANAGER` | Hecho (ítem o catálogo) |
| Alertas de clientes sin pedido en 30 días | todos los que ven la cuenta | Hecho |
| Cupos de descuento con tope, metas | — | No: ideas del plan maestro |
| Publicidad con vigencia y slot | — | Fase 8 |
| Chat con el comercio | — | Fase 9 |
| QR imprimible del código | — | El código se copia; el ícono es de sección |

### Camino que se implementó

1. Endpoints `/my/*` (org, team, access-codes, clients) con el `TenantRole` de la sesión.
2. Nav derivada de `tenantType` / `tenantRole`, no de `User.role`.
3. Home distinta para `DISTRIBUTOR`, más `/pedidos` de cartera.
4. Guardas de ruta: un comercio no entra a `/clientes`; un distribuidor no entra a `/search`.
5. El superadmin sigue viendo el árbol; para usar el panel Tipo 2 se entra como esa persona.

### Qué vendría después (prioridad)

1. Mudar el carrito de la web al de la API, para que dos vendedores del mismo local no se pisen.
2. Publicidad con vigencia y slot, no solo el boolean.
3. Reconstruir Tipo 3 (marcas) sobre este mismo modelo. El módulo `/marca` actual no aplica.
4. Chat entre comercio y vendedor asignado.
5. Cupos de descuento por vendedor y metas (si el producto lo pide).

## Verificación

```bash
API_URL=... ADMIN_PASSWORD=... node scripts/check-tipo1-team.mjs
API_URL=... ADMIN_PASSWORD=... node scripts/check-distributor-portfolio.mjs
```
