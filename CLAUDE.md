# CLAUDE — Contexto del monorepo NODO

Monorepo pnpm de NODO, con dos apps:

- `apps/web` — frontend Next.js 15 / React 19 / Tailwind. Reglas específicas en `apps/web/CLAUDE.md`.
- `apps/api` — backend NestJS + Fastify + Prisma (Postgres). Redis (ioredis) solo para el pub/sub del chat; no hay cola de jobs: el trabajo en background va con promesas en proceso + cron de `@nestjs/schedule`. Reemplaza al backend anterior (`suppliersapi-g3je.onrender.com`), reconstruido desde cero.
- `packages/shared` — tipos TS compartidos (`Provider`, `ProductDTO`, `UserRole`, `JwtPayload`, envelope `ApiResponse<T>`). Ambas apps deben importar tipos de acá en vez de redefinirlos.

## Alcance actual

El backend cubre auth, búsqueda agregada por proveedor, credenciales por
organización, y los tres tipos de cliente. Tipo 3 (marcas) es espacio in-app,
mapa de SKUs de distros con semáforo/precio sugerido, materiales y acciones:
`docs/PLAN_TIPO3.md`. No hay catálogo propio de marca ni landing pública como
producto.

## Contrato de API

`API_CONTRACT.md` (raíz) es la fuente de verdad del contrato real implementado entre `apps/web` y `apps/api`. `apps/web/API_CONTRACT.md.legacy` es el contrato del backend anterior — solo referencia histórica, no implementar contra eso.

## Proveedores

`NEW_BYTES, ELIT, GRUPO_NUCLEO, AIR, NEW_TREE, INVID, GC, POLYTECH, ASHIR, HDC, SOLUTION_BOX, DISTECNA, CEVEN, DIAPSTORE` — `KNOWN_PROVIDERS` en `packages/shared/src/providers.ts`. Además existen **proveedores por lista** (`LIST_<SLUG>`, `Tenant.providerKey` generado al crearlos desde el panel) cuyo catálogo entra por planillas: módulo `apps/api/src/list-import` (spec en `docs/superpowers/specs/2026-09-03-supplier-list-import-design.md`). `Provider` es `string`; validar con `isProviderKey`, etiquetar con `providerLabel`. La integración real con cada proveedor (auth, endpoint, formato de respuesta) se documenta por proveedor a medida que se implementa; no asumir nada sin confirmarlo. New Tree va por emulación del portal WebForms (PageMethods `wsNRW_*` + páginas HTML), no por su SOAP: `docs/superpowers/specs/2026-09-05-new-tree-portal-integration-design.md`.

## Qué hay de nuevo (changelog)

Cada push con un cambio que nota el comercio suma una entrada ARRIBA en `apps/web/lib/changelog.ts` y sube la versión (función nueva → 2.7.0 → 2.8.0; solo arreglos → 2.7.1). El modal "Qué hay de nuevo" se abre una vez por versión y la versión se ve abajo a la izquierda del sidebar (lleva a `/actualizaciones`). Textos para el comercio, concretos; nada interno ni del superadmin.
