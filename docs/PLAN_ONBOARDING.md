# Onboarding de comercios (Tipo 1) y plan gratuito

Documento vivo. Define el alta self-serve de un comercio, el recorrido guiado y el
plan Mostrador (`FREE`) antes de publicar precios de Local / Cadena.

## Objetivo

Un cliente nuevo (comercio) tiene que:

1. Crear cuenta (usuario + email + contraseña).
2. Nombrar su **organización** (obligatorio; sin org no hay app).
3. Entrar al **plan Mostrador (gratuito)**.
4. Recorrer NODO con datos de demostración: 2 distribuidores, 4 productos,
   filtros, carrito y 2 pedidos de ejemplo.
5. Poder invitar subusuarios; **cada persona** tiene su propio
   `User.onboardingCompletedAt` y ve el recorrido la primera vez.

## Flujo

```
/register → login automático → /onboarding
  ├─ sin Tenant → POST /onboarding/bootstrap (nombre + contacto)
  │                 · crea Tenant RETAILER plan=FREE, membership OWNER
  │                 · siembra demo (distros + ofertas + pedidos)
  │                 · devuelve JWT fresco con tenant
  └─ con Tenant → pasos guiados (proveedores, búsqueda, filtros, pedidos, equipo)
                 → POST /onboarding/complete
```

Subusuario creado desde `/equipo`: al primer login `needsOnboarding=true` (no pide
nombre de org; arranca en el plan y el tour de su rol).

## Demo

Distribuidores plataforma (`managedByPlatform`):

| Nombre | Clave |
|---|---|
| Distribuidora Demo Norte | `LIST_DEMO_NORTE` |
| Distribuidora Demo Sur | `LIST_DEMO_SUR` |

Cuatro productos (Logitech, Samsung, Redragon, Kingston) en categorías distintas
para ejercitar filtros. Pedidos offline marcados `[DEMO]`.

Regenerar: `POST /onboarding/reseed-demo` o Configuración → Ayuda.

## Planes

| `TenantPlan` | Pantalla | Estado |
|---|---|---|
| `FREE` | Mostrador | Activo en el alta |
| `LOCAL` | Local | Alcance listo; precio a definir |
| `CADENA` | Cadena | Alcance listo; precio a definir |

Límites duros de cupo (usuarios, proveedores) se agregan cuando se publiquen
precios. Hoy el plan se persiste y se muestra; no bloquea features.

## API

Ver `API_CONTRACT.md` → Onboarding comercio (Tipo 1).

## Pantallas

- `/onboarding` — wizard (fuera del shell con sidebar).
- Coach flotante mientras `needsOnboarding` y ya hay org.
- Configuración → Ayuda: reabrir recorrido / regenerar demo.

## Relación con la arquitectura

Complementa la fase 5 de `docs/ARQUITECTURA_TENANTS.md` (tipo 1 autónomo): ahora
el **primer OWNER** también se crea solo, sin pasar por el árbol de superadmin.
