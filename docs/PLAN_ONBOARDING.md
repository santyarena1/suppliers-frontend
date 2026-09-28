# Onboarding de comercios (Tipo 1) y plan PRO

Documento vivo. Alta self-serve de un comercio y recorrido guiado dentro de la app.

## Flujos

### Alta nueva
```
/register o landing #cuenta → login → /onboarding (solo el nombre del comercio)
  └─ POST /onboarding/bootstrap → Tenant RETAILER plan=PRO + OWNER + demo
     └─ entra a la app: la guía arranca sola en "welcome"
```

### Alta desde superadmin
`POST /admin/onboarding/retailers` crea comercio + dueño + demo. El recorrido arranca en el
primer ingreso del dueño.

### Repetir el recorrido
Configuración → Ayuda → Repetir (`POST /onboarding/start-tour`): borra el paso guardado,
asegura la demo y la guía vuelve a empezar.

### Superadmin desde la landing (preview)
Login + `POST /onboarding/preview`: suelta Administración y hace el alta desde cero.
"Salir del preview" / terminar restaura Administración.

## Una sola fuente de verdad

El paso en el que va cada persona vive en `User.onboardingStep` y viaja en
`GET /onboarding/status` como `currentStep`. La app lo guarda con `POST /onboarding/step`
cada vez que avanza. Lo único local es si la guía está pausada (preferencia de pantalla).
Antes había dos estados (hub y spotlight) que se desincronizaban y entraban en loop.

## Pasos (`apps/api/src/onboarding/onboarding-steps.ts`)

| Paso | Pantalla | Resalta | Avanza |
|---|---|---|---|
| welcome | / | — (tarjeta centrada) | Empezar |
| search | /search?q=logitech | `search-results` | Siguiente |
| add-to-cart | /search?q=logitech | `add-to-cart` | solo, al sumar un producto |
| cart | /cart | `cart-list` | Siguiente |
| orders | /pedidos | `orders-list` | Siguiente |
| providers (dueño/admin) | /proveedores | `add-provider` | Siguiente |
| team (dueño/admin) | /equipo | `team-add` | Siguiente |
| done | — | — | Terminar |

## Guía (`components/onboarding`)

- `OnboardingCoach`: resalta sin bloquear (el oscurecido no captura clics), ubica la tarjeta
  con su tamaño real para no tapar lo señalado, hoja inferior en celular. Atrás / Pausar /
  Siguiente, Esc pausa, ← → navegan. Fuera de la pantalla del paso muestra un aviso chico
  "Ir al paso" en vez de arrastrar a la persona.
- `OnboardingChecklist`: con la guía pausada, píldora "Primeros pasos x/y" con la lista:
  retomar, saltar a cualquier paso o "No mostrar más".

## Demo

| Distro | Clave |
|---|---|
| Distribuidora Demo Norte | `LIST_DEMO_NORTE` |
| Distribuidora Demo Sur | `LIST_DEMO_SUR` |

~12 productos con foto; el mouse Logitech y el monitor Samsung están en los dos distros con
distinto precio/stock para mostrar la comparación. 2 pedidos `[DEMO]`.
Regenerar: `POST /onboarding/reseed-demo`.

No son organizaciones reales: solo las ve quien está en el recorrido (alta, repaso o
preview). Como son proveedores por lista, el ocultamiento global de proveedores no las tapa.

## API

Ver `API_CONTRACT.md` → Onboarding comercio (Tipo 1).
