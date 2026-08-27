# Tipo 3 — Marcas sobre Tenant / TenantLink

El módulo viejo (`BrandAccount`, slugs, `ROLE_BRAND` como brújula, Excel de
disponibilidad) **no se porta**. Esta es la reconstrucción encima del mismo modelo
que ya opera Tipo 1 y Tipo 2.

## Qué es una marca en NODO

Una organización `TenantType.BRAND`. En pantalla siempre se ve `Tenant.name`.
Cada término canónico del catálogo (`PlatformCatalogTerm` kind=`BRAND`) tiene
**una org y un usuario dueño**, aunque nadie real la administre: el placeholder
(`marca.{slug}` / `*@nodo.internal`, `User.managedByPlatform`) deja el modelo
listo. El superadmin entra como esa persona, igual que con un distro.

La URL pública de marketing usa una clave opaca (`BrandLanding.publicKey` →
`/m/:publicKey`). Nunca un slug `/marca/acme`.

## Descubrimiento

Una marca **no es descubrible** en el B2B. Un comercio solo la ve con
`TenantLink`, publicidad paga o canje de un `TenantAccessCode`. La landing
pública es marketing (quiénes somos): **no abre catálogo ni precios**.

```
Tenant (RETAILER)  ──TenantLink──▶  Tenant (DISTRIBUTOR)
       │
       └──TenantLink──▶  Tenant (BRAND)

Tenant (DISTRIBUTOR) ──TenantLink──▶ Tenant (BRAND)
```

## Roles internos

| Rol | Alcance |
|---|---|
| `OWNER` / `ADMIN` | Equipo, códigos, publicidad, acciones, landing, avisos. |
| `MARKETING` | Landing y acciones (objetivos, materiales a futuro). |
| `COMMERCIAL` | Acciones dirigidas a distros/comercios concretos. |
| `VIEWER` | Solo lectura. |

La navegación sale de `tenantType === "BRAND"`, no de `User.role`. Quien entre
como marca no ve búsqueda, carrito, comparador ni cartera de Tipo 2.

## Recorte implementado

1. **Identidad.** Al arrancar (y al crear un término BRAND en el catálogo) se
   asegura Tenant + landing + dueño placeholder. Superadmin: botón “Orgs de
   marcas” en el árbol. `POST /admin/brands/sync`.
2. **Vínculos.** Códigos de la marca (`/codigos`). Canje anónimo desde el
   comercio. Distro↔marca lo arma el superadmin. Cliente del link: comercio o
   (solo hacia marca) distribuidor.
3. **Landing pública.** `GET /public/brands/:publicKey`, página `/m/:publicKey`
   fuera del shell autenticado. El panel edita en `/marca/landing`.
4. **Acciones medibles.** `BrandAction`: unidades, compra en USD o rebate, con
   vigencia, alcance (distros / comercios / SKU `PROVIDER:externalId`) y
   progreso sobre `ProviderOrder` `CREATED`/`OFFLINE`. Si el ítem no trae
   `brand`/`displayBrand`, no se inventa. Sin comercios vinculados, progreso 0.
5. **Avisos hacia Tipo 1.** Al activar una acción (si `notifyRetailers`) y a
   mano desde Cuentas. El comercio lee `/avisos`. Distro y marca pueden
   `POST /my/notifications/send` a un comercio vinculado.
6. **Nav.** `/` BrandHome · `/marca/acciones` · `/marca/landing` ·
   `/marca/cuentas` · reusa `/equipo`, `/codigos`, `/publicidad`. Comercio:
   `/marcas` y `/avisos`.

## Qué no está en este recorte

- Chat marca↔comercio (mismo producto persona a persona de Tipo 2, cuando se
  enganche; no un buzón por vínculo).
- Materiales, capacitaciones, Excel de disponibilidad del módulo viejo.
- Borrar `ROLE_BRAND` del enum de plataforma (sigue existiendo por usuarios
  históricos; ya no manda la nav).

Las rutas viejas `/marca/*` y `/marcas/*` redirigen al recorte nuevo.
