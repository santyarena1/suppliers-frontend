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

### Fase 0 — Cerrar el borrado del catálogo

Restringir los dos endpoints destructivos a `ROLE_ADMIN`. Es independiente de todo lo
demás y tapa el agujero más grave. Sin cambios de esquema.

### Fase 1 — La organización en la sesión

- Toda persona queda con una membresía: a los usuarios existentes sin organización se
  les crea un `RETAILER` propio en la migración.
- El JWT suma `tenantId` y `tenantRole`, tanto en el login como en la suplantación.
- Un helper de contexto resuelve la organización para que el código de negocio la
  consulte sin repetir la búsqueda.

Sin cambios de comportamiento visible. Es el cimiento de las fases siguientes.

### Fase 2 — Credenciales por organización

- `Credential` pasa de `(userId, providerName)` a `(tenantId, providerName)`.
- La migración asigna cada credencial a la organización de su dueño. Si dos personas de
  la misma organización cargaron credenciales del mismo proveedor, queda la más
  reciente y las otras se registran en la auditoría.
- Todo lo que hoy pide credenciales por usuario pasa a pedirlas por organización.

### Fase 3 — Precio y stock por organización

La fase grande. Separar la ficha de la oferta, mover la sincronización a escribir
ofertas por organización, y aplicar markup y umbral en la lectura.

Los precios que hay hoy en la base traen el markup adentro y no hay forma de saber de
quién eran, así que la migración los copia a la oferta de la organización que
sincronizó último y los marca como pendientes de resincronizar.

### Fase 4 — Búsqueda cerrada

La búsqueda pasa a filtrar por `TenantLink`: un comercio solo ve los distribuidores con
los que tiene vínculo. Para no dejar a nadie sin catálogo de un día para el otro, la
migración crea un vínculo por cada credencial existente: si ya tenés cuenta con un
distribuidor, estás vinculado.

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
