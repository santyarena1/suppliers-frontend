# NODO

Monorepo de NODO — buscador/agregador de proveedores y portal B2B de marcas. Gestionado con pnpm workspaces.

```
apps/
  web/      — frontend Next.js (existía como repo standalone, movido acá)
  api/      — backend nuevo (NestJS + Fastify + Prisma), reemplaza al backend anterior de Render
packages/
  shared/   — tipos TypeScript compartidos entre web y api (proveedores, roles, envelope de respuesta)
```

## Setup

```bash
pnpm install
pnpm dev:web   # frontend en :3000
pnpm dev:api   # backend en el puerto configurado en apps/api/.env
```

Ver `API_CONTRACT.md` para el contrato de endpoints entre frontend y backend, y `apps/web/API_CONTRACT.md.legacy` para el contrato original (backend anterior, solo referencia histórica).
