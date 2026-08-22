# Arquitectura multi-tenant de NODO — plan maestro

Documento vivo. Define la estructura de organizaciones, usuarios, permisos y visibilidad
sobre la que se construye todo lo demás. Cualquier módulo nuevo se diseña contra esto.

---

## 1. Conceptos

**Organización (`Tenant`)** — la unidad de aislamiento. Un comercio, un distribuidor o una
marca. Todos los datos de negocio cuelgan de una organización.

**Membresía (`TenantMembership`)** — vincula un `User` con una organización y le asigna un
rol interno (`TenantRole`). Un usuario puede tener más de una membresía (por ejemplo, un
consultor que atiende dos comercios), pero el caso normal es una sola.

**Rol de plataforma (`User.role`)** — `ROLE_USER`, `ROLE_ADMIN`, `ROLE_BRAND`. Solo indica
nivel de acceso a Nodo. **El alcance funcional lo define siempre la membresía.**

**Superadmin** — `User.role = ROLE_ADMIN` sin membresías. Ve y administra todo el árbol.

---

## 2. Los tres tipos de cliente

### Tipo 1 — Comercio (`TenantType.RETAILER`)

El caso que hoy representa `testuser`: un local, su dueño o su encargado de compras.

| Rol interno | Alcance |
|---|---|
| `OWNER` | Control total: credenciales de proveedores, usuarios internos, confirmación de órdenes, vínculos comerciales. |
| `BUYER` | Busca, compara y arma órdenes. Confirma solo si el `OWNER` le habilita la aprobación. |
| `SELLER` | Arma carritos y deja las órdenes en `PENDING_APPROVAL`. Nunca confirma. |
| `VIEWER` | Solo lectura. |

Reglas:

- Ve la búsqueda agregada **únicamente** de los proveedores con `TenantLink` activo.
- Los proveedores no vinculados no existen para él: no aparecen en filtros, ni en listados,
  ni en mensajes de error. Excepciones: publicidad paga del proveedor, o canje de código.
- Si la organización tiene un solo usuario, ese `OWNER` concentra todo y las órdenes nacen
  con `approvalStatus = NOT_REQUIRED`.
- Cada comercio tiene un vendedor asignado por distribuidor
  (`TenantLink.accountManagerId`), que es el punto de contacto comercial.

### Tipo 2 — Distribuidor (`TenantType.DISTRIBUTOR`)

Proveedores y marcas distribuidoras. Ejemplos reales: New Bytes, Elit. Se enlaza al
catálogo mediante `Tenant.providerKey` (`NEW_BYTES`, `ELIT`, …) cuando el proveedor tiene
integración por API.

| Rol interno | Alcance |
|---|---|
| `OWNER` | Gerente. Usuarios internos, publicidad contratada, códigos de vinculación, política de precios y descuentos, asignación de vendedores a clientes. |
| `SELLER` | Ve solo sus clientes asignados: resumen de órdenes, descuentos puntuales, sus datos de contacto visibles para el cliente. |
| `PRODUCT_MANAGER` | Controla una o varias marcas **dentro de su distribuidor** (`ProductManagerScope`): descuentos, combos y publicidad limitados a esas marcas. |
| `VIEWER` | Solo lectura. |

Capacidades:

- **Publicidad opcional (paga).** Habilita que el distribuidor sea visible para comercios
  no vinculados, en el header de búsqueda o en el inicio, con un CTA para solicitar cuenta
  o conectar la API. Sin publicidad, es invisible.
- **Códigos de vinculación.** Genera QR y códigos escritos (`TenantAccessCode`) para
  entregar por fuera de Nodo. El canje no revela a qué distribuidor pertenece el código
  hasta completarse.
- **Marcas sin API.** Las marcas que no son distribuidoras y trabajan con Excel suben su
  propia lista de precios; si un comercio ya las tiene conectadas, quedan habilitadas.

Ideas a evaluar (no implementadas): cupos de descuento por vendedor con tope aprobado por
el gerente, alertas de clientes inactivos, metas por vendedor, y visibilidad de la
competencia agregada y anonimizada como producto de datos.

### Tipo 3 — Marca (`TenantType.BRAND`)

Administra una marca del sistema. Se enlaza con el módulo de Marcas vía `Tenant.brandId`.

| Rol interno | Alcance |
|---|---|
| `OWNER` | Usuarios internos, publicidad, códigos de vinculación, acciones comerciales. |
| `MARKETING` | Campañas, materiales, capacitaciones, objetivos por comercio. |
| `COMMERCIAL` | Descuentos y acciones dirigidas a un distribuidor y comercio concretos. |
| `VIEWER` | Solo lectura. |

Capacidades:

- Selecciona un distribuidor y un comercio y aplica un descuento o una acción de marketing.
  Todo lo contabiliza Nodo.
- El comercio ve estadísticas de cada marca; la marca ve reportes por comercio (por
  ejemplo, objetivos de compra de un producto, de una categoría o de la marca completa).
- Igual que el distribuidor: sin publicidad no es descubrible, y los códigos de
  vinculación son anónimos hasta el canje.

---

## 3. Relaciones

```
Tenant (RETAILER)  ──TenantLink──▶  Tenant (DISTRIBUTOR)
       │                                   │
       │                                   └─ accountManagerId → User (SELLER del distribuidor)
       │
       └──TenantLink──▶  Tenant (BRAND)
```

- `TenantLink` es la única puerta de visibilidad entre organizaciones. Estados:
  `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`.
- `TenantAccessCode` crea un `TenantLink` al canjearse. Tiene `maxUses`, `expiresAt` y
  `revoked`, y registra cada canje en `TenantAccessCodeRedemption`.
- `ProductManagerScope` acota qué marcas maneja un PM dentro de su distribuidor.

---

## 4. Flujo de aprobación de órdenes

`ProviderOrder` incorpora `createdByUserId`, `approvedByUserId` y `approvalStatus`:

- `NOT_REQUIRED` — la armó alguien con poder de confirmar.
- `PENDING_APPROVAL` — la armó un `SELLER` del comercio; queda guardada en Nodo y en el
  carrito del distribuidor, sin confirmar.
- `APPROVED` — el `OWNER` la confirmó; recién ahí se emite al proveedor.
- `REJECTED` — descartada por el `OWNER`.

---

## 5. Superadmin

Vista de árbol: **Organización → usuarios (por rol interno) → relaciones**. Al seleccionar
cualquier usuario debe verse su organización, sus pares internos, y las organizaciones
relacionadas directa (vínculo propio) o indirectamente (vínculo de su organización).

En pantalla, siempre nombres normalizados. Nunca slugs ni claves internas.

---

## 6. Fases

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Modelo de datos: `Tenant`, `TenantMembership`, `TenantLink`, `TenantAccessCode`, `ProductManagerScope`, campos de aprobación en `ProviderOrder`. | Hecho |
| 2 | Superadmin: árbol de organizaciones, alta y edición de organizaciones y membresías, datos semilla de ejemplo. | Hecho |
| 3 | Filtrado real por `tenantId` en búsqueda, credenciales y órdenes. Guards por `TenantType` y `TenantRole`. | Pendiente |
| 4 | Aprobación de órdenes end to end en la interfaz del comercio. | Pendiente |
| 5 | Códigos y QR de vinculación: generación, canje anónimo y auditoría. | Pendiente |
| 6 | Panel del distribuidor: cartera de clientes por vendedor, descuentos, resumen de órdenes. | Pendiente |
| 7 | Panel de la marca: acciones comerciales dirigidas, objetivos y reportes. | Pendiente |
| 8 | Publicidad paga y descubrimiento controlado. | Pendiente |
| 9 | Chat entre comercio y vendedor del distribuidor. | Pendiente |
