# CLAUDE — Contexto del monorepo NODO

Monorepo pnpm de NODO, con dos apps:

- `apps/web` — frontend Next.js 15 / React 19 / Tailwind. Reglas específicas en `apps/web/CLAUDE.md`.
- `apps/api` — backend NestJS + Fastify + Prisma (Postgres) + BullMQ (Redis). Reemplaza al backend anterior (`suppliersapi-g3je.onrender.com`), reconstruido desde cero.
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

`NEW_BYTES, ELIT, GRUPO_NUCLEO, AIR, NEW_TREE, INVID, GC, POLYTECH, ASHIR, HDC, SOLUTION_BOX, DISTECNA, CEVEN, DIAPSTORE` — definidos en `packages/shared/src/providers.ts`. La integración real con cada proveedor (auth, endpoint, formato de respuesta) se documenta por proveedor a medida que se implementa; no asumir nada sin confirmarlo.
