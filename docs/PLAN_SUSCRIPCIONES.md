# Planes y suscripciones de comercios (Tipo 1)

Documento vivo. El plan es de la **organización** (`Tenant`), nunca de la persona. Solo los
`RETAILER` tienen plan comercial; distribuidores y marcas siguen sin restricciones de plan.

## Planes

| Plan | Precio | Para qué |
|---|---|---|
| NODO Base (`BASE`) | USD 35 / mes | Centralizar y preparar compras |
| NODO Pro (`PRO`) | USD 45 / mes | Operar compras y proveedores desde NODO |
| NODO Custom (`CUSTOM`) | USD 150 / mes + USD 300 de puesta en marcha (pago único) | NODO adaptado a la empresa |

Catálogo, capacidades y reglas: `packages/shared/src/plans.ts` (única fuente de verdad; la web
lo espeja en `apps/web/lib/plans.ts` porque no depende del paquete compartido). Nada en el
código pregunta `plan === "PRO"`: se pregunta por una **capacidad**.

### Capacidades

| Capacidad | Base | Pro | Custom |
|---|---|---|---|
| `maxSearchProviders` | 5 | sin tope | sin tope |
| `directCheckout` (confirmar/enviar pedido al portal, aprobación online) | — | ✓ | ✓ |
| `providerPortalAccess` (formas de pago, percepciones del portal) | — | ✓ | ✓ |
| `providerAccountAccess` (cuenta corriente, pedidos del portal, facturas, pagos) | — | ✓ | ✓ |
| `integratedChat` | — | ✓ | ✓ |
| `advancedAnalytics` (`/orders/insights*`) | — | ✓ | ✓ |
| `externalIntegrations`, `customModules`, `customBranding` | — | — | ✓ |

Todos los planes incluyen: buscador, comparación, ficha, catálogo, favoritos, carrito
multi-proveedor, generar pedido / copiar / WhatsApp (pedido offline), carga de listas,
sincronización, **equipo y permisos completos**, aprobación de pedidos e historial básico.

### Base: proveedores en búsqueda

- Conectados: ilimitados. Activos en búsqueda: hasta 5 a la vez.
- `ProviderLink.includeInSearch` (por comercio y proveedor): `true` elegido, `false` apagado,
  `null` sin elegir. Con tope, entran primero los `true` y después los `null` por orden de
  conexión, hasta completar 5 (`selectSearchProviders`). Un `false` nunca entra.
- `PUT /my/providers/:provider/search { enabled }` prende/apaga. Prender el sexto responde
  409 `PLAN_SEARCH_LIMIT` con el texto del plan. Apagar nunca desconecta ni borra credenciales.
- Lo resuelve `TenantVisibilityService.listFor` (`VisibleProvider.inSearch`); el buscador
  agregado y el catálogo unificado usan `canSearch` / `searchableCatalogKeys`. La ficha de un
  proveedor y su catálogo propio siguen abiertos (son lectura, no búsqueda simultánea).
- Pro y Custom: todos los conectados buscan (los `false` elegidos en Base se limpian al subir).

### Carrito en Base

"Confirmar pedido" se reemplaza por **Generar pedido** (pedido offline: queda en Pedidos con el
mensaje listo para copiar o mandar por WhatsApp). No se precarga el carrito del portal. El
carrito nunca se bloquea. El backend rechaza checkout directo y aprobación online con 403
`PLAN_FEATURE_UNAVAILABLE`.

### Cambios de plan

- Subir (Base → Pro): inmediato si la suscripción está al día (`POST /my/subscription/upgrade`
  del dueño); si no, queda como pedido para Administración.
- Bajar a Base: no se borra nada. Si había más de 5 en búsqueda, quedan activos los 5 más
  usados (último pedido) y el comercio puede cambiarlos (`pickSearchProvidersOnDowngrade`).
- Pasar a Custom deja la puesta en marcha en `PENDING`. Estados: `PENDING`, `PAID`,
  `WAIVED` (exento), `NOT_APPLICABLE`. `blocksCustom` decide si, pendiente, bloquea las
  capacidades exclusivas de Custom (por defecto no).

## Suscripción

Entidad `Subscription` (1 por tenant) separada de `Tenant.plan`, con `SubscriptionPayment`,
`SubscriptionEvent` (historial) y `SubscriptionReminder`. Cada acción de Administración deja
además un `AuditLogEntry` (`entityType: "Subscription"`).

Estados: `TRIAL`, `ACTIVE`, `PAST_DUE`, `GRACE_PERIOD`, `SUSPENDED`, `COURTESY`, `CANCELLED`.

El estado **efectivo** se calcula en cada request con las fechas (`computeSubscriptionState`),
así que un vencimiento corta a tiempo aunque el cron no haya corrido. El cron horario
(`SubscriptionRemindersService`, `15 * * * *`) sincroniza el estado guardado y manda los
recordatorios. Una suspensión manual (`suspensionReason != "OVERDUE"`) es pegajosa hasta
reactivar.

### Vencimiento (`SUBSCRIPTION_POLICY`)

```
vence ─1 día─▶ PAST_DUE ──▶ GRACE_PERIOD ──(7 días desde el vencimiento)──▶ SUSPENDED
```

- `PAST_DUE` y `GRACE_PERIOD`: todo funciona, con banner "Tu suscripción venció. Regularizá el
  pago para mantener NODO activo." + "Ver suscripción".
- `SUSPENDED` / `CANCELLED` (acceso `RESTRICTED`): no se borra nada y es reversible. Se puede
  entrar, ver datos y regularizar. Se bloquean las operaciones: cualquier método que escribe,
  la búsqueda en vivo por proveedor y las capacidades de plan (403 `SUBSCRIPTION_SUSPENDED`).
  Quedan abiertas las rutas `@AllowWhenRestricted()` (`/my/subscription*`, marcar avisos).
  La web muestra pantalla de suspensión en buscador, comparador, carrito y mensajes.
- Registrar un pago lo vuelve `ACTIVE` en el momento y extiende el período desde el
  vencimiento vigente (`paymentPeriod`).
- Prueba (`TRIAL`): 14 días; al terminar sigue el mismo camino que un vencimiento.

### Recordatorios

7 y 3 días antes, el día del vencimiento, 3 días después, un día antes de suspender y al
suspender. Uno por tipo y vencimiento (`SubscriptionReminder` único), guardado aunque falle.
Canal hoy: aviso in-app (`OrgNotification` `SYSTEM`, `landingKey = subscription:<tipo>`, que la
web lleva a `/suscripcion`). Sumar email = agregar el canal en `REMINDER_CHANNELS`.

### Cortesía

Por tenant, desde Administración: plan, vencimiento opcional (sin fecha = indefinida), motivo.
Se cancela (vence hoy) o se convierte en suscripción paga con la fecha del próximo cobro. El
cliente la ve como "Plan Pro Activo" (el estado `COURTESY` no se le muestra).

### Pagos

`SubscriptionPayment.provider`: `MANUAL`, `TRANSFER`, `COURTESY`, `OTHER` hoy; `MERCADOPAGO` y
`STRIPE` preparados para cuando haya pasarela (no hay integración). El comercio puede avisar
que pagó (`POST /my/subscription/payment-notice`); Administración lo registra.

## Enforcement

- `TenantGuard` resuelve los entitlements del tenant (`TenantContext.entitlements`) y aplica
  los decoradores `@RequiresCapability`, `@RequiresActiveSubscription` y
  `@AllowWhenRestricted` (`apps/api/src/tenants/entitlements.ts`). Los servicios usan
  `assertCapability` / `hasCapability` donde la ruta sola no alcanza (aprobación online,
  pedido offline en modo manual).
- Superadmin en su propia sesión: sin restricciones de plan (operación administrativa).
  Suplantando a alguien: ve exactamente lo que ve esa organización.
- Distribuidores y marcas: `entitlements` sin enforcement.
- Errores: el envelope lleva `code` (`PLAN_FEATURE_UNAVAILABLE`, `PLAN_SEARCH_LIMIT`,
  `SUBSCRIPTION_SUSPENDED`) y `details`. La web los lee con `planErrorOf`.

## Altas

- Self-serve (`POST /onboarding/bootstrap`): NODO Base en prueba. El preview del superadmin
  entra en Pro por cortesía.
- Administración (`POST /admin/onboarding/retailers`): elige plan (Base/Pro/Custom) y modalidad
  (paga, prueba o cortesía). Por defecto Pro pago.
- Migración: los comercios existentes (`PRO`/`LOCAL`/`CADENA`) pasan a `PRO` con una
  suscripción en `COURTESY` sin vencimiento: nadie pierde funciones al desplegar.

## Pantallas

- Comercio: **Plan y facturación** (`/suscripcion`): plan, estado, próximo vencimiento, uso de
  búsqueda, pagos, upgrade (dueño), aviso de pago y comparador. Upgrades en contexto
  (`UpsellNotice`, `PlanGate`), nunca pop-ups.
- Proveedores: contador "Proveedores conectados · Activos en búsqueda X / 5" y switch
  "Incluir en búsqueda" por proveedor.
- Administración → **Suscripciones**: filtros (Todas, Activas, Próximas a vencer, Vencidas, En
  gracia, Suspendidas, Cortesía, Canceladas) con contadores, tabla y ficha con acciones
  (plan y precio pactado, pago, fecha de cobro, extender, cortesía, suspender, reactivar,
  cancelar, puesta en marcha, notas) e historial.
- Landing: tres tarjetas (Pro destacado "MÁS ELEGIDO") y "Ver todas las funciones".

## API

Ver `API_CONTRACT.md` → Planes y suscripciones.
