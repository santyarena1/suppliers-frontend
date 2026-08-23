# Plan de aislamiento por organización

Cómo se lleva la plataforma del aislamiento actual (por usuario, y en varios lugares
inexistente) al modelo de `docs/ARQUITECTURA_TENANTS.md`. Este documento se actualiza
a medida que avanzan las fases.

## Qué está mal hoy

**1. Cualquiera puede borrar el catálogo de un proveedor.**
`DELETE /providers/:provider/products` y `POST /providers/:provider/clear-zero-stock`
solo exigen estar autenticado: no piden rol ni acotan a nada
(`apps/api/src/providers/providers.controller.ts:433-441`). Borran filas de
`ProviderSyncCache`, que es una tabla compartida por toda la plataforma, así que un
solo usuario deja sin productos a todos los demás.

**2. Los precios de un comercio pisan los de los otros.**
`ProviderSyncCache` tiene una sola fila por `(provider, externalId)` para toda la
plataforma, pero el markup y el umbral de stock mínimo son por usuario y se aplican
**al escribir**, no al leer (`providers.service.ts:227-241`). Consecuencias:

- Si un comercio sincroniza con markup 15%, todos los demás ven ese precio inflado.
- Dos comercios con cuentas distintas en el mismo distribuidor tienen listas de
  precios distintas, pero gana el último que sincronizó.
- `missingProductAction` y `zeroStockAction` en `DELETE` o `HIDE` hacen que la
  configuración de un comercio borre u oculte productos para el resto.
- Cambiar el markup no cambia nada hasta la próxima sincronización, porque el precio
  viejo ya quedó grabado.

**3. La búsqueda muestra todo.**
`search()` filtra por proveedor visible y nombre, nada más
(`providers.service.ts:317-328`). No mira credenciales ni vínculos, así que un
comercio ve productos de distribuidores con los que no tiene relación. Esto contradice
la regla de descubrimiento cerrado.

**4. La sesión no sabe a qué organización pertenece quien la usa.**
El JWT lleva `userId` y el rol de plataforma, nada de tenant
(`packages/shared/src/roles.ts`). El módulo de organizaciones existe pero solo lo
consume el panel de superadmin: ningún servicio de negocio lo consulta.

## Modelo objetivo

La decisión ya tomada es **ficha global, precio y stock por organización**. Eso se
traduce en separar en dos lo que hoy es una sola tabla:

- **`ProviderSyncCache`** queda como la ficha del producto: nombre, marca, categoría,
  descripción, imágenes, EAN, SKU, dimensiones. Es igual para todos y no tiene precio
  ni stock.
- **`TenantProductOffer`** (nueva) guarda lo que ese producto cuesta y cuánto hay para
  una organización concreta: `(tenantId, provider, externalId)` → precio, moneda, IVA,
  stock, estado de stock, fecha de sincronización.

Lo que se guarda en la oferta es el valor **crudo** que devolvió el proveedor con las
credenciales de esa organización. El markup y el umbral de stock mínimo pasan a
aplicarse **en la lectura**. Así cambiar el markup tiene efecto inmediato, es
reversible, y es imposible que la configuración de una organización altere lo que ve
otra.

`Credential` y `ProviderSyncConfig` pasan de estar indexados por `userId` a estarlo por
`tenantId`, que es lo que corresponde: la cuenta en el distribuidor es del comercio, no
de la persona que la cargó.

## Fases

Cada fase se despliega primero a staging, se verifica con un script, y recién después
se mergea a `main`. Ninguna fase depende de que la siguiente esté lista.

### Fase 0 — Cerrar el borrado del catálogo — **hecha**

Los dos endpoints destructivos quedaron restringidos a `ROLE_ADMIN`, y el frontend
esconde la zona de peligro para el resto. Verifica `scripts/check-catalog-guard.mjs`.

### Fase 1 — La organización en la sesión — **hecha**

El token lleva `tenantId`, `tenantName`, `tenantType` y `tenantRole`, tanto al iniciar
sesión como al entrar como otro usuario. `TenantContextService` los resuelve y cae a la
base cuando el token no los trae, para que las sesiones viejas sigan sirviendo hasta que
venzan. La migración le dio organización propia a quien no tenía; el superadmin queda
afuera a propósito. Verifica `scripts/check-tenant-session.mjs`.

### Fase 2 — Credenciales por organización — **hecha**

`Credential` y `ProviderSyncConfig` pasaron a `(tenantId, …)`. `TenantGuard` deja la
organización en el request y `@CurrentTenant()` la exige; el guard nunca rechaza, así el
superadmin sigue usando lo que no la necesita. El cron de sincronización corre por
organización y saltea las inactivas. Las filas duplicadas dentro de una organización y
las que no tenían organización posible quedaron anotadas en la auditoría con su
contenido cifrado antes de borrarse. Verifica
`scripts/check-credentials-by-tenant.mjs`.

### Fase 3 — Precio y stock por organización — **hecha**

`ProviderSyncCache` quedó como la ficha del producto —qué es, cómo se llama, la foto— y
`TenantProductOffer` guarda qué cuesta y cuánto hay para cada organización. El historial
de precio también pasó a ser por organización: cada comercio compra con su cuenta y su
lista, así que la serie de uno no dice nada sobre la de otro.

La sincronización guarda el precio **crudo** del proveedor. El markup y el umbral de
stock mínimo se aplican al leer, en `catalog-view.ts`: cambiarlos se ve al instante en
toda la plataforma, volver atrás es cambiar un número en vez de resincronizar el
catálogo entero, y la configuración de un comercio ya no puede alterar lo que ve otro.
Las acciones sobre faltantes y sobre stock cero borran u ocultan ofertas, no fichas.

Dos consecuencias visibles:

- Un comercio solo ve los productos que sincronizó con su propia cuenta. Sin oferta no
  hay precio que mostrar, y un precio traído con la cuenta de otro no sería el suyo.
- El superadmin no pertenece a ninguna organización, así que el catálogo le da vacío. No
  es un error: para mirar el catálogo de alguien está "entrar como".

Los precios que había traían el markup adentro y no hay forma de saber cuál era el
crudo. La migración se los atribuye a la organización que sincronizó ese proveedor por
última vez —la que de verdad los trajo— y los marca con `needsResync` hasta la próxima
sincronización real. Verifica `scripts/check-offers-by-tenant.mjs`.

Como el borrado de catálogo ya no afecta a nadie más, volvió a la organización: lo puede
hacer un `OWNER` o un `ADMIN` del comercio, no un vendedor.

### Fase 4 — Descubrimiento cerrado — **hecha**

Cada proveedor pasó a ser también una organización de tipo distribuidor, con su nombre
normalizado y su `providerKey`. `TenantVisibilityService` decide qué proveedores existen
para un comercio: los que tiene vinculados por `TenantLink` y los que pagaron publicidad.
El resto no aparece en ninguna pantalla ni responde por API — pedir el estado de un
proveedor no vinculado da 404, no 403, porque un "no tenés permiso" ya confirmaría que
existe.

La publicidad paga solo da presencia: el comercio ve que el distribuidor existe y puede
cargarle su cuenta, y hacerlo lo deja vinculado. Para todo lo demás está el canje de
`TenantAccessCode` en `POST /my/redeem-code`: el código se entrega por fuera de NODO,
todos los rechazos responden lo mismo para que nadie pueda enumerar organizaciones
probando códigos, y el nombre se revela recién cuando el canje sale bien.

Para no dejar a nadie sin catálogo de un día para el otro, la migración da por vinculado
a todo el que ya venía usando un proveedor: credencial cargada, configuración de
sincronización u ofertas existentes. Verifica `scripts/check-closed-discovery.mjs`.

En el frontend, `GET /my/providers` es la única fuente de la lista: el dashboard de
proveedores, los filtros de búsqueda, la navegación lateral, la home, diagnósticos y la
tira de logos salen todos de ahí. Los paneles de superadmin siguen viendo todo.

### Fase 5 — Carrito y órdenes por organización

- El carrito deja de vivir en el navegador y pasa a la API, acotado por organización.
- `ProviderOrder` suma `tenantId` y se activan los campos de aprobación, que hoy
  existen en el esquema pero no los usa ningún código.
- Un `SELLER` que arma un pedido lo deja en `PENDING_APPROVAL`; lo confirma un `OWNER`.

## Reparto de trabajo

Mientras dure el plan, para no pisarnos:

**No tocar** — los voy a estar modificando y migrando:

- `apps/api/prisma/schema.prisma` y `apps/api/prisma/migrations/`
- `apps/api/src/providers/providers.service.ts` y `sync-scheduler.service.ts`
- `apps/api/src/credentials/`, `apps/api/src/cart/`, `apps/api/src/auth/`
- `apps/api/src/common/guards/` y `apps/api/src/common/decorators/`
- `apps/api/src/tenants/`
- `packages/shared/src/roles.ts` y `packages/shared/src/tenants.ts`

**Libre** — no los toco:

- Todo lo visual de `apps/web`: `components/search/`, `components/layout/`, la home, la
  ficha de producto, estilos, navegación, `lib/theme.tsx`, `lib/prefs.tsx`
- El módulo de Marcas entero (`app/(app)/admin/marcas/`, `app/marca`, `lib/brands/`),
  que está fuera de alcance del backend nuevo
- Los adapters de proveedor (`apps/api/src/providers/adapters/`): ahí solo se
  interpreta lo que devuelve cada proveedor, y eso no cambia. Voy a cambiar qué se
  hace con el resultado, no cómo se lee.
- Los servicios de checkout y cuenta por proveedor (`*-order.service.ts`,
  `*-account.service.ts`) hasta la fase 5

**Avisar antes**:

- `apps/web/lib/api.ts`, que es enorme y los dos vamos a querer editar
- `apps/web/components/admin/`
