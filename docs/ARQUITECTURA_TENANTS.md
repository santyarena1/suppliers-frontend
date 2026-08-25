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

## 1.1 Decisiones tomadas

Estas definiciones ya están resueltas y condicionan el diseño. No volver a abrirlas sin
acordarlo.

- **Las credenciales de proveedor son de la organización, no de la persona.** El
  administrador del comercio carga la cuenta de cada distribuidor y todo el comercio
  compra con ella.
- **El precio de un producto es por comercio.** La ficha es global; precio y stock van
  por organización. El markup se aplica al leer.
- **Una persona pertenece a una sola organización.** El esquema soporta varias membresías,
  pero el producto asume una.
- **En un comercio no hay “Dueño”.** El que manda es el Administrador (`ADMIN`). Ver
  `docs/PLAN_TIPO1.md`.
- **El carrito del comercio es uno, compartido y persistido en la API.**
- **El descuento de cuenta lo define el distribuidor**, no el comercio.

## 2. Los tres tipos de cliente

### Tipo 1 — Comercio (`TenantType.RETAILER`)

El caso que hoy representa `testuser`: un local y su administrador o encargado de compras.

En pantalla, nunca “Dueño”. Roles: Administrador, Comprador, Vendedor, Solo lectura.

| Rol interno | En pantalla | Alcance |
|---|---|---|
| `ADMIN` | Administrador | Control total: equipo, credenciales, markup, firma de pedidos, tilde del comprador, vínculos. |
| `BUYER` | Comprador | Busca y arma el carrito. Confirma solo si el administrador le dio vía libre. |
| `SELLER` | Vendedor | Arma el carrito compartido. Nunca confirma: queda en `PENDING_APPROVAL`. |
| `VIEWER` | Solo lectura | Ve catálogo, pedidos y vínculos. No toca carrito ni cuentas. |

Reglas:

- Ve la búsqueda agregada **únicamente** de los proveedores con `TenantLink` activo.
- Los proveedores no vinculados no existen para él. Excepciones: publicidad paga, o canje
  de código (en el celular, también escaneando el QR que generó el mayorista).
- Si el comercio tiene un solo administrador, las órdenes que él confirma nacen
  `NOT_REQUIRED`.
- El carrito es uno por local, en la API, compartido entre quien puede pedir.
- Cada comercio puede tener un vendedor asignado por distribuidor
  (`TenantLink.accountManagerId`), visible para el local. El descuento de ese vínculo
  no lo gestiona el comercio.
- El cierre de este tipo está en `docs/PLAN_TIPO1.md`.

### Tipo 2 — Distribuidor (`TenantType.DISTRIBUTOR`)

Proveedores y marcas distribuidoras. Ejemplos reales: New Bytes, Elit. Se enlaza al
catálogo mediante `Tenant.providerKey` (`NEW_BYTES`, `ELIT`, …) cuando el proveedor tiene
integración por API.

| Rol interno | En pantalla | Alcance |
|---|---|---|
| `OWNER` | Gerente | Equipo, códigos + QR, descuento por comercio, publicidad, asignar vendedor. No se puede dejar la organización sin un gerente activo. |
| `ADMIN` | Administrador | Lo mismo en el día a día; no reemplaza al gerente para el “último al mando”. |
| `SELLER` | Vendedor | Ve solo sus clientes asignados: resumen de órdenes, descuentos puntuales, chat. No ve el comercio de un compañero. |
| `PRODUCT_MANAGER` | Product Manager | Marcas de su `ProductManagerScope`, solo dentro de su distribuidor. Busca ese recorte y carga el descuento de esas marcas. No entra a cartera, códigos, publicidad ni chat. |
| `VIEWER` | Solo lectura | Mira cartera, pedidos y chat. |

El cierre de este tipo está en `docs/PLAN_TIPO2.md`. NODO para ellos es cartera y su propio catálogo, no para comprarle a otras integraciones. El descuento del vínculo y el de marca se aplican al precio que lee el comercio; el local no ve los porcentajes. El chat nace acá y se ve también en el local. No hay alta pública: lo crea el superadmin.

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

- `NOT_REQUIRED` — la armó alguien con poder de confirmar (administrador, o comprador
  con vía libre).
- `PENDING_APPROVAL` — la armó un vendedor, o un comprador sin vía libre; queda en Nodo
  hasta que la firma un administrador.
- `APPROVED` — el administrador la confirmó; recién ahí se emite al proveedor.
- `REJECTED` — descartada por el administrador.

---

## 5. Superadmin

Vista de árbol: **Organización → usuarios (por rol interno) → relaciones**. Al seleccionar
cualquier usuario debe verse su organización, sus pares internos, y las organizaciones
relacionadas directa (vínculo propio) o indirectamente (vínculo de su organización).

En pantalla, siempre nombres normalizados. Nunca slugs ni claves internas.

---

## 6. Fases

El aislamiento (3a–5) quedó cerrado en `docs/PLAN_AISLAMIENTO.md` y ya está
en producción. El comercio está en `docs/PLAN_TIPO1.md`. El distribuidor,
en `docs/PLAN_TIPO2.md`. Marcas (Tipo 3) no se arrancan hasta cerrar Tipo 2.

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Modelo de datos: `Tenant`, `TenantMembership`, `TenantLink`, `TenantAccessCode`, `ProductManagerScope`, campos de aprobación en `ProviderOrder`. | Hecho |
| 2 | Superadmin: árbol de organizaciones, alta y edición de organizaciones y membresías, datos semilla de ejemplo. | Hecho |
| 3a | Ficha global, precio y stock por organización. | Hecho |
| 3b | `Credential`, `ProviderSyncConfig`, `CartItem` y `ProviderOrder` por organización. | Hecho (el carrito de la web todavía no usa la API) |
| 3c | Organización y rol interno en el JWT, más guard de membresía. | Hecho |
| 3d | Búsqueda filtrada por `TenantLink`. | Hecho |
| 4 | Aprobación de órdenes en la interfaz del comercio. | Hecho en API y `/pedidos`; la UI aún no distingue roles |
| 5 | Códigos de vinculación: generación, canje anónimo y auditoría. | Hecho el código escrito. QR queda para Tipo 2 |
| T1 | Cerrar el comercio: panel del local, alta, equipo, carrito compartido, roles. | Hecho. `docs/PLAN_TIPO1.md` |
| 6 | Panel del distribuidor: cartera por vendedor, descuentos, resumen de órdenes. | Hecho en `docs/PLAN_TIPO2.md` |
| 7 | Panel de la marca: acciones comerciales, objetivos y reportes. | Después de Tipo 2 |
| 8 | Publicidad paga y descubrimiento controlado. | Tilde del gerente en Tipo 2. Descubrimiento ya existía |
| 9 | Chat entre comercio y vendedor del distribuidor. | Hecho en Tipo 2 |
