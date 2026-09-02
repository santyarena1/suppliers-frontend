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

**Superadmin** — `User.role = ROLE_ADMIN`. Siempre ve y administra el árbol. En
entornos de prueba pertenece a **Administración**: carrito y pedidos propios.
Credenciales de proveedor, distribuidores y marcas vinculados se leen del
**Comercio de Pruebas** (los de `testuser1`) vía `Tenant.mirrorsCommercialFromId`.
El `ROLE_ADMIN` no se pierde. No hace falta “entrar como” para buscar.

---

## 1.1 Decisiones tomadas

Estas definiciones ya están resueltas y condicionan el diseño. No volver a abrirlas sin
acordarlo.

- **Las credenciales de proveedor son de la organización, no de la persona.** El `OWNER`
  del comercio carga la cuenta de cada distribuidor y todo el comercio compra con ella.
  Implica mover `Credential` de `userId` a `tenantId`.
- **El precio de un producto es por comercio.** La API del proveedor devuelve el precio de
  la cuenta autenticada, así que no existe "el precio de un producto de New Bytes".
  `ProviderSyncCache` se parte en dos: la ficha del producto (nombre, SKU, imágenes,
  especificaciones) sigue siendo global, y precio y stock pasan a una tabla por
  organización. Hoy esto es un bug real: el markup configurado por un usuario se escribe
  en el catálogo global y contamina lo que ven los demás.
- **Una persona pertenece a una sola organización.** El esquema soporta varias membresías,
  pero el producto asume una. No hay selector de organización activa y el JWT lleva una
  sola. Si alguna vez hace falta, se habilita sin migrar datos.

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

Administra una marca del catálogo. Cada término `BRAND` tiene una organización
y un dueño (placeholder si nadie la tomó). Se identifica en pantalla por
`Tenant.name`. La landing pública usa `publicKey`, no un slug.

| Rol interno | Alcance |
|---|---|
| `OWNER` | Equipo, códigos, publicidad, acciones, landing. |
| `ADMIN` | Igual que el dueño salvo tocar a otro `OWNER`. |
| `MARKETING` | Landing y acciones (objetivos medibles). |
| `COMMERCIAL` | Acciones dirigidas a un distro y un comercio. |
| `VIEWER` | Solo lectura. |

Capacidades:

- Acciones medibles (unidades, USD, rebate) sobre pedidos reales de los
  comercios vinculados. Si el ítem no trae marca, no se cuenta.
- Landing pública de marketing. No abre catálogo B2B ni precios.
- Avisos hacia el comercio vinculado. Códigos anónimos hasta el canje.
- Sin publicidad no es descubrible en el B2B.

---

## 3. Relaciones

```
Tenant (RETAILER)  ──TenantLink──▶  Tenant (DISTRIBUTOR)
       │                                   │
       │                                   └─ accountManagerId → User (SELLER del distribuidor)
       │
       └──TenantLink──▶  Tenant (BRAND)

Tenant (DISTRIBUTOR) ──TenantLink──▶ Tenant (BRAND)
```

- `TenantLink` es la única puerta de visibilidad entre organizaciones. Estados:
  `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`. El cliente es un comercio, o un
  distribuidor cuando el proveedor es una marca.
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
La cuenta de Nodo (clave, nivel de plataforma, módulos, “Entrar como”) se administra
en la misma ficha, no en una pantalla aparte.

En pantalla, siempre nombres normalizados. Nunca slugs ni claves internas.

El superadmin de prueba (`superadmin`) pertenece a Administración. El carrito y
los pedidos son los de esa organización. Credenciales, distribuidores y marcas
vinculados se leen del Comercio de Pruebas. “Entrar como” sigue existiendo para
mirar la plataforma con los ojos de otra persona.

---

## 6. Fases

El aislamiento por organización (lo que `docs/PLAN_AISLAMIENTO.md` numeraba 0–5) ya está
hecho. Esta tabla es el producto, no la migración.

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Modelo de datos: `Tenant`, `TenantMembership`, `TenantLink`, `TenantAccessCode`, `ProductManagerScope`, aprobación en `ProviderOrder`. | Hecho |
| 2 | Superadmin: árbol, alta de organizaciones y membresías, seed. | Hecho |
| 3 | Catálogo por organización, credenciales por organización, JWT con membresía, descubrimiento cerrado. | Hecho |
| 4 | Pedidos y aprobación en la interfaz del comercio. | Hecho |
| 5 | Tipo 1 autónomo: el dueño arma su equipo, canjea códigos y carga el contacto, sin pasar por el superadmin. | Hecho |
| 6 | Tipo 2: panel del distribuidor (cartera por vendedor, códigos, pedidos de clientes, inactivos, alcance del PM). | Hecho |
| 7 | Tipo 3: org por marca, espacio in-app, mapa de SKUs (semáforo + precio sugerido), materiales, acciones, avisos y chat. | Hecho — `docs/PLAN_TIPO3.md` |
| 8 | Publicidad paga: espacios, precio, cupo, campañas, impresiones/clicks. El flag `advertisingEnabled` es “esta cuenta paga”. | Hecho |
| 9 | Chat persona a persona (org + usuario + rol), no un buzón por vínculo. | Hecho — `/mensajes` |
| — | Carrito de la organización en la API (un armado por local, visible al distro). | Hecho — `/cart/org` |

Detalle del Tipo 2: `docs/PLAN_TIPO2.md`. Tipo 3: `docs/PLAN_TIPO3.md`.

