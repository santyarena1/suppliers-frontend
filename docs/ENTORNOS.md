# Entornos

NODO corre en dos entornos completamente separados. El objetivo de esta separación
es poder ensayar los cambios de esquema y de modelo de datos del plan multi-tenant
(`docs/ARQUITECTURA_TENANTS.md`) sin arriesgar los datos reales.

| | Producción | Staging |
|---|---|---|
| Rama de git | `main` | `staging` |
| API (Railway) | `api-production-f4aa.up.railway.app` | `api-staging-8316.up.railway.app` |
| Frontend (Vercel) | despliegue de producción | cualquier deploy de preview |
| Postgres y Redis | propios del entorno | propios del entorno |
| Datos | reales | organizaciones de ejemplo |

Ambos entornos viven en el mismo proyecto de Railway (`nodo`) pero en environments
distintos, cada uno con su propio Postgres, su propio Redis y sus propios secretos.
`JWT_SECRET` y `ENCRYPTION_KEY` son diferentes a propósito: una sesión o una
credencial cifrada de un entorno no sirve en el otro.

## Flujo de trabajo

1. Trabajar sobre `staging`. Al pushear, Railway despliega la API de staging y
   Vercel publica un preview que ya apunta a esa API.
2. Probar contra el preview. La rama tiene una URL estable:
   `suppliers-frontend-git-staging-santiagos-projects-c44fd932.vercel.app`.
3. Cuando el cambio está validado, mergear `staging` en `main`. Eso despliega la
   API de producción y el frontend de producción.

Las migraciones de Prisma se aplican solas al arrancar cada contenedor, así que una
migración se prueba en staging simplemente pusheando a esa rama.

## Cómo apunta cada frontend a su API

En Vercel, `NEXT_PUBLIC_API_URL` (cliente) y `API_TARGET` (el proxy `/api/*` que
corre en el servidor) están definidas por separado para Production y para Preview.
Las dos importan: si solo se define una, la mitad de las llamadas termina en el
entorno equivocado.

## Acceso

Los deploys de Vercel en dominios `.vercel.app` están detrás de la autenticación de
Vercel, así que hay que estar logueado en Vercel para abrirlos desde el navegador.
Para verificaciones automatizadas está habilitado el bypass de automatización: se
pasa el secreto en el header `x-vercel-protection-bypass`, o por query string junto
con `x-vercel-set-bypass-cookie=true` para dejar la cookie en el navegador. El
secreto se consulta con `vercel project protection --json`.

## Poblar un entorno vacío

```bash
# 1. Crear el primer administrador (único paso que no pasa por la API).
#    Ver el encabezado de scripts/bootstrap-superadmin.cjs.

# 2. Cargar las organizaciones y usuarios de ejemplo.
API_URL=https://api-staging-8316.up.railway.app \
ADMIN_PASSWORD=... \
node scripts/seed-demo-tenants.mjs

# 3. Verificar que la suplantación funciona de punta a punta.
API_URL=https://api-staging-8316.up.railway.app \
ADMIN_PASSWORD=... \
node scripts/check-impersonation.mjs
```

Los usuarios de ejemplo comparten la contraseña `password123`. El superadmin de
prueba está en Administración: carrito y pedidos propios. Credenciales de
proveedor, distribuidores y marcas vinculados son los del Comercio de Pruebas
(`testuser1`). En staging público, si el superadmin todavía tiene una contraseña
propia, alcanza con volver a entrar después del deploy para que el token traiga
la organización.

## Cuidado

`railway service source connect` cambia la rama de **todos** los environments del
servicio, no solo del que se pasa por `--environment`. Después de usarlo hay que
verificar que producción siga en `main`:

```bash
railway api 'query($id: String!) { project(id: $id) { deploymentTriggers { edges { node { branch environmentId } } } } }' \
  --raw-var "id=dcb61a8d-81ad-4c22-983f-5b1e4770f8d0"
```
