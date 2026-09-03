# Tipo 3 — Marcas sobre Tenant / TenantLink

El módulo viejo (`BrandAccount`, slugs, `ROLE_BRAND` como brújula, 16 estados
de stock, catálogo paralelo `BrandProduct`) **no se porta**. Esta es la
reconstrucción encima del mismo modelo que ya opera Tipo 1 y Tipo 2.

## Qué es una marca en NODO

Una organización `TenantType.BRAND`. En pantalla siempre se ve `Tenant.name`.
Cada término canónico del catálogo (`PlatformCatalogTerm` kind=`BRAND`) tiene
**una org y un usuario dueño**, aunque nadie real la administre: el placeholder
(`marca.{slug}` / `*@nodo.internal`, `User.managedByPlatform`) deja el modelo
listo. El superadmin entra como esa persona, igual que con un distro.

La marca **no tiene catálogo propio**. Los productos viven en los distros
(`ProviderSyncCache`). La marca los mira, los elige y les pone un overlay:
semáforo + precio sugerido (`BrandSkuSignal`). Nunca ve el precio ni el stock
live de un comercio.

El trabajo real es el **espacio in-app** (`/marcas/:linkId` para quien está
vinculado). La URL pública `/m/:publicKey` es marketing opcional. Nunca un
slug `/marca/acme`.

## Descubrimiento

Una marca **no es descubrible** en el B2B. Un comercio o un distro solo la ve
con `TenantLink`, publicidad paga o canje de un `TenantAccessCode`. El canje
está en `/marcas` (no en Proveedores). Un distro solo puede canjear códigos de
`BRAND`.

```
Tenant (RETAILER)  ──TenantLink──▶  Tenant (DISTRIBUTOR)
       │
       └──TenantLink──▶  Tenant (BRAND)

Tenant (DISTRIBUTOR) ──TenantLink──▶ Tenant (BRAND)
```

## Roles internos

| Rol | Alcance |
|---|---|
| `OWNER` / `ADMIN` | Equipo, códigos, publicidad, mapa, materiales, espacio, acciones, avisos. |
| `MARKETING` | Espacio, mapa, materiales/capacitaciones y acciones. |
| `COMMERCIAL` | Mapa, acciones dirigidas a distros/comercios concretos. |
| `VIEWER` | Solo lectura. |

La navegación sale de `tenantType === "BRAND"`, no de `User.role`. Quien entre
como marca no ve búsqueda, carrito, comparador ni cartera de Tipo 2.

## Espacio in-app

El comercio (Tipo 1) y el distro (Tipo 2) vinculado abren `/marcas/:linkId`.
Ahí vive la estética de la marca (logo, colores, tipografía, HTML propio
sanitizado) y los bloques nativos de NODO:

| Hueco | Qué inserta NODO |
|---|---|
| `{{productos}}` / `{{semaforos}}` | Mapa comercial (5 luces + precio sugerido) |
| `{{acciones}}` | Acciones vigentes con progreso |
| `{{novedades}}` / `{{noticias}}` | Notas publicadas de esa marca |
| `{{materiales}}` | Archivos de venta |
| `{{capacitaciones}}` | Cursos / videos / argumentarios |
| `{{hablar}}` | Chat persona a persona |
| `{{nombre}}` / `{{logo}}` | Identidad |

Si la marca no pega HTML, **la landing nativa es la página**: hero a ancho
completo (portada o mosaico con fotos de SKUs y novedades), navegación de
módulos (el shell de NODO no scrollea con hash: los botones usan
`scrollIntoView`), productos con imagen grande y semáforo, acciones,
novedades con cover, materiales, capacitaciones y contacto. Si pega HTML,
**ese HTML es el cuerpo de la misma landing**: los huecos reciben los
módulos, y si falta un hueco Nodo lo agrega al final de ese documento.
Nunca hay una segunda página “abajo de la landing”. Un botón muerto del HTML
(`href="#"`, `<button>` sin destino) salta a ese bloque. Un comercio puede
saltar a `/search?marca=Nombre` (la búsqueda general, filtrada). El distro no
tiene búsqueda: ve el mapa, no arma pedidos de marca.

La URL pública `/m/:publicKey` arma la misma landing con recorte seguro:
productos (nombre + imagen, sin precio ni semáforo), acciones (título y
vigencia, sin progreso ni alcances a un comercio/distro), novedades
`isPublic`, materiales/capacitaciones (título y texto, sin archivos).

En el comercio, **siempre se listan los módulos** (espacio, productos, acciones,
novedades, materiales, capacitaciones, contacto). Si la marca no cargó uno,
el bloque queda **Pendiente**: el vínculo existe, el contenido todavía no.
`presence.pending` en `GET /my/brands` marca una conectada sin nada publicado.

## Semáforos (5 luces)

| Luz | Uso |
|---|---|
| `GREEN` | Hay / empujar |
| `YELLOW` | Poco / consultar |
| `RED` | Sin stock |
| `BLUE` | Próximo ingreso |
| `GRAY` | Discontinuado |

Unique `(tenantId, provider, externalId)`. Solo SKUs de esa marca en la caché
de distros. Import CSV (`provider`, `externalId`/`sku`, `light`/`semaforo`,
`precio_sugerido`, `notes`).

## Recorte implementado

1. **Identidad.** Al arrancar (y al crear un término BRAND en el catálogo) se
   asegura Tenant + landing + dueño placeholder. Superadmin: botón “Orgs de
   marcas” en el árbol. `POST /admin/brands/sync`.
2. **Vínculos.** Códigos de la marca (`/codigos`). Canje anónimo desde el
   comercio **o el distro** en `/marcas`. Distro↔marca también lo arma el
   superadmin.
3. **Espacio in-app.** `GET /my/brands/:linkId`. Tema + HTML sanitizado +
   mapa + materiales + capacitaciones + acciones + Hablar. Landing pública
   `/m/:publicKey` opcional.
4. **Mapa de SKUs.** `GET /my/brand/catalog` (caché de distros, filtrada por
   marca). `PUT /my/brand/signals` y `POST /my/brand/signals/import`. UI:
   `/marca/productos`.
5. **Materiales y capacitaciones.** `BrandResource` `MATERIAL` | `TRAINING`.
   Upload PDF/Excel/imagen (`POST /assets/upload-file`) o link. UI:
   `/marca/materiales`, `/marca/capacitaciones`.
6. **Acciones medibles.** `BrandAction`: unidades, compra en USD o rebate, con
   vigencia, alcance y progreso sobre `ProviderOrder` `CREATED`/`OFFLINE`.
7. **Avisos y chat** con el comercio o el distro vinculado. Mismo producto que
   Tipo 2. UI: `/avisos`, `/mensajes`.
8. **Nav.** Panel · Productos · Materiales · Capacitaciones · Acciones ·
   Espacio · Cuentas · Mensajes · reusa `/equipo`, `/codigos`, `/publicidad`.
   Comercio y distro: `/marcas` (canje + hub) y `/avisos`.

## Qué no está en este recorte

- Catálogo paralelo `BrandProduct` del módulo viejo.
- Mostrar precios/stock live de comercios a la marca.
- 16 estados `StockStatus` del legado.
- Cupos/metas de distro, facturación ads.
- Borrar `ROLE_BRAND` del enum de plataforma (sigue existiendo por usuarios
  históricos; ya no manda la nav).
- Blog de novedades de plataforma (`BrandNews` del módulo viejo no se porta).
  Es un módulo fijo aparte: `docs/PLAN_NOTICIAS.md`.
