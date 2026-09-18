# Onboarding de comercios (Tipo 1) y plan PRO

Documento vivo. Define el alta self-serve de un comercio, el recorrido guiado con
spotlight y el plan PRO antes de publicar precios de Local / Cadena.

## Flujos

### Alta nueva
```
/register o landing #cuenta → login → /onboarding
  ├─ POST /onboarding/bootstrap (nombre + contacto)
  │    · Tenant RETAILER plan=PRO + OWNER + demo
  └─ pasos setup (plan) → tour interactivo (spotlight) → complete
```

### Comercio ya existente
```
Configuración → Ayuda → Reabrir  ·  o  POST /onboarding/start-tour
  · marca onboardingReplay, salta org/plan
  · asegura catálogo demo
  · tour con clics resaltados
```

### Superadmin desde la landing
```
Landing #cuenta → usuario "superadmin" + clave
  · login + POST /onboarding/preview
  · guarda Administración, suelta membresía
  · onboarding desde 0 (crear org + tour)
  · complete / preview/exit restaura Administración
```

## Spotlight

Cada paso `kind=tour` lleva `spotlight` (selector `data-tour`). El overlay
`OnboardingSpotlight` oscurece la app y encuadra el control. Estética alineada a
la landing (`--void`, `--lilac`, Archivo / Chivo Mono en el hub).

## Demo

| Distro | Clave |
|---|---|
| Distribuidora Demo Norte | `LIST_DEMO_NORTE` |
| Distribuidora Demo Sur | `LIST_DEMO_SUR` |

4 productos + 2 pedidos `[DEMO]`. Regenerar: `POST /onboarding/reseed-demo`.

## API

Ver `API_CONTRACT.md` → Onboarding comercio (Tipo 1).
