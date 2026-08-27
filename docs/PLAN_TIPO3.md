# Tipo 3 — Marcas sobre Tenant / TenantLink

El módulo actual (`apps/web/app/marca`, `apps/web/app/marcas`, `apps/web/lib/brands`)
es de otra época: usuarios `ROLE_BRAND`, slugs, un árbol paralelo. **No se porta.**
Se reconstruye encima del mismo modelo que ya opera Tipo 1 y Tipo 2.

Este documento es el planteo. No hay implementación acá.

## Qué es una marca en NODO

Una organización `TenantType.BRAND`. Se identifica en pantalla por `Tenant.name`.
Si más adelante hay un catálogo canónico de marca, el enlace interno es
`Tenant.brandId` — nunca un slug en la UI.

Una marca **no es descubrible**. Un comercio o un distribuidor solo la ve si existe
un `TenantLink` (o publicidad paga, o un código de vinculación canjeado).

```
Tenant (RETAILER)  ──TenantLink──▶  Tenant (DISTRIBUTOR)
       │
       └──TenantLink──▶  Tenant (BRAND)

Tenant (DISTRIBUTOR) ──TenantLink──▶ Tenant (BRAND)
```

Dos puertas, no una: la marca habla con el **comercio** y con el **distribuidor**.
El comercial de la marca elige un par (distribuidor, comercio) para una acción;
Nodo contabiliza. Un comercio nunca “conoce” una marca con la que no está vinculado.

## Roles internos

| Rol | Alcance |
|---|---|
| `OWNER` | Equipo, códigos, publicidad, acciones comerciales, contacto de la org. |
| `ADMIN` | Igual que el dueño salvo tocar a otro `OWNER`. |
| `MARKETING` | Campañas, materiales, capacitaciones, objetivos por comercio. No arma descuentos. |
| `COMMERCIAL` | Descuentos y acciones dirigidas a un distribuidor y un comercio concretos. |
| `VIEWER` | Solo lectura. |

El `User.role = ROLE_BRAND` deja de mandar. La navegación sale de `tenantType === "BRAND"`.
Quien entre como marca no ve búsqueda ni carrito ni cartera de Tipo 2.

## Qué puede hacer (producto)

1. **Equipo y contacto** — el mismo `/equipo` y `/my/org` de Tipo 1/2, con los roles de marca.
2. **Códigos de vinculación** — iguales a los del distribuidor. Anónimos hasta el canje.
   Un comercio que canjea un código de marca obtiene un `TenantLink` con esa marca,
   no un listado de marcas.
3. **Cartera de cuentas** — comercios (y, si aplica, distribuidores) vinculados.
   El `COMMERCIAL` ve las cuentas que le asignaron (`accountManagerId`), igual que el
   vendedor del distro.
4. **Acción sobre un par comercio+distribuidor** — descuento, combo, material, objetivo.
   Nodo lo registra. El precio que paga el comercio sigue siendo el de su cuenta en
   el distribuidor; la marca no pisa el catálogo global.
5. **Materiales y capacitaciones** — archivos de la org, visibles solo a los vínculos
   activos. Nada de un portal público de marca.
6. **Objetivos y reportes** — la marca ve compras de *sus* comercios vinculados
   (agregadas, por comercio, por producto/categoría). El comercio ve el objetivo
   que esa marca le puso. Nunca se cruzan locales.
7. **Publicidad** — el mismo flag de hoy, después vigencia y slot (fase 8).
8. **Chat** — un hilo por `TenantLink` marca↔comercio (y, si hace falta,
   marca↔distribuidor). Misma pieza que Tipo 2. No se inventa otro messenger.

## Qué no se hace

- No se reusa `BrandAccount` / `BrandAccess` / las pantallas `/marca` como fuente
  de verdad. Si algún dato histórico sirve, se migra a `Tenant` + `TenantLink`.
- No aparece una marca “para que el comercio la descubra” en búsqueda.
- No hay slugs, handles ni URLs `/marca/acme`. La ficha se abre por el nombre y el
  `linkId`.
- El superadmin no opera el panel de una marca desde Administración; entra como
  esa persona, igual que con un distro.
- Un `PRODUCT_MANAGER` de un distribuidor no es una marca. Sigue acotado a
  `ProductManagerScope` **dentro** de su distro.

## Recorte de implementación (cuando toque)

Orden cerrado, para no mezclar el portal viejo con el modelo nuevo:

1. **Identidad.** Alta de `Tenant` tipo `BRAND` en el árbol de superadmin. Membresías
   con `OWNER` / `MARKETING` / `COMMERCIAL` / `VIEWER`. Nav de marca: inicio, cuentas,
   códigos, equipo, mensajes. Guardas de ruta.
2. **Vínculos.** Códigos de la marca, canje desde el comercio (el mismo endpoint
   anónimo), listado de cuentas. Sin publicidad todavía más que el flag.
3. **Acciones comerciales.** Una entidad `BrandAction` (nombre a definir) con
   `tenantId` de la marca, `linkId` al comercio, `distributorTenantId` opcional,
   vigencia, tipo (`DISCOUNT` / `MATERIAL` / `GOAL`). Visible al comercio en la
   ficha de esa marca — no en un feed global.
4. **Materiales.** Assets de la org, no un CDN público.
5. **Reportes.** Lectura de `ProviderOrder` de los comercios vinculados, filtrada
   por marca de ítem cuando se pueda (catálogo canónico / `displayBrand`). Si no
   se puede atribuir, no se inventa.
6. **Apagar el módulo viejo.** Redirects de `/marca` y `/marcas` al recorte nuevo,
   o 404. Borrar `ROLE_BRAND` como brújula de navegación.

El chat de Tipo 2 ya está pensado para un hilo por vínculo: Tipo 3 se engancha
sin otro producto de mensajería.

## Fuera de este planteo

Carrito de API, publicidad paga con slot, cupos/metas del distribuidor. Eso sigue
en `docs/PLAN_TIPO2.md` y en las fases 8+ de `docs/ARQUITECTURA_TENANTS.md`.
