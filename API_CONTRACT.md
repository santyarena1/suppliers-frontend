# API Contract — NODO

Contrato entre `apps/web` y `apps/api`. Actualizado con el rediseño del buscador.

## Implementado

### [FEATURE] Verificación de email (código)
- **Método**: POST
- **Ruta**: `/auth/register` · `/auth/verify-email` · `/auth/resend-verification` · `/auth/login`
- **Auth**: público (throttle: 10/min register/login/verify, 5/min resend)
- **Body / Params**: register `{ username, email, password }` · verify `{ email, code }` (6 dígitos) · resend `{ email }`
- **Respuesta esperada**: register `{ id, username, email, needsVerification: true }` (sin JWT) · verify `{ token }` · resend `{ sent: true }` · login sin confirmar: **403** `{ code: "EMAIL_NOT_VERIFIED", details: { email } }`
- **Estado**: IMPLEMENTADO
- **Notas**: El mail es el canal de la cuenta: no hay opt-in ni casilla de “puede o no recibir información”. El código dura 15 minutos, 5 intentos, reenvío cada 60s; se guarda hasheado (SHA-256 + `EMAIL_CODE_PEPPER` o `JWT_SECRET`). Cuentas ya existentes, altas de admin/equipo y placeholders `@nodo.internal` nacen verificadas. Envío: `RESEND_API_KEY` o SMTP (`SMTP_HOST`…). En desarrollo, si no hay proveedor, el cuerpo va al log. Front: `/verify-email`.

### [FEATURE] Login con Google
- **Método**: POST
- **Ruta**: `/auth/google`
- **Auth**: público (throttle 10/min)
- **Body / Params**: `{ idToken }` (GIS, Identity Services)
- **Respuesta esperada**: `{ token }`
- **Estado**: IMPLEMENTADO
- **Notas**: El API verifica el ID token con `GOOGLE_CLIENT_ID` (claves JWKS de Google). El front usa el mismo valor en `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; si falta, no se muestra el botón. Google confirma el mail: la cuenta nace verificada (o se vincula a una existente por email). Sin contraseña hasta que la cree con "Olvidé mi contraseña". Si Google no marcó `email_verified`, 401. Cuenta desactivada: 401; email vinculado a otro Google: 409. La web recuerda (localStorage `nodo:last-login`) si la última entrada fue con Google y en /login lo muestra primero.

### [FEATURE] Login con usuario o email
- **Método**: POST
- **Ruta**: /auth/login
- **Auth**: público (Turnstile, throttle 10/min)
- **Body / Params**: `{ username, password }` — `username` acepta el usuario o el email (con `@` se busca por email sin distinguir mayúsculas).
- **Respuesta esperada**: `{ token }`. Cuenta creada con Google sin contraseña: **401** `{ code: "GOOGLE_ACCOUNT" }` (la web ofrece Google o "Crear una contraseña").
- **Estado**: IMPLEMENTADO

### [FEATURE] Olvidé mi contraseña
- **Método**: POST
- **Ruta**: /auth/forgot-password · /auth/reset-password
- **Auth**: público (Turnstile; throttle 5/min forgot, 10/min reset)
- **Body / Params**: forgot `{ email }` · reset `{ email, code, password }` (código de 6 dígitos; contraseña 8–128)
- **Respuesta esperada**: forgot `{ sent: true }` siempre (exista o no la cuenta, desactivada, en espera de reenvío o con el mail caído) · reset `{ token }` para entrar directo.
- **Estado**: IMPLEMENTADO
- **Notas**: Código propio (`purpose = RESET_PASSWORD`): el de verificar email no sirve y viceversa. 15 minutos, 5 intentos, reenvío cada 60 s. Al cambiarla: sube `sessionVersion` (cierra las otras sesiones), levanta el bloqueo por intentos y confirma el mail si no lo estaba. Sirve para que una cuenta creada con Google tenga contraseña. Front: `/forgot-password` (link en /login).

### [FEATURE] Envío de mail a una cuenta (admin)
- **Método**: POST
- **Ruta**: `/admin/users/:id/email`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**: `{ subject, text }`
- **Respuesta esperada**: `{ sent: true, to }`
- **Estado**: IMPLEMENTADO
- **Notas**: Usa el mismo `MailService` que la confirmación. No hay baja ni preferencias de marketing: el email de la cuenta es el domicilio para avisos de NODO.

### [FEATURE] Onboarding comercio (Tipo 1) + plan NODO Base
- **Método**: GET | POST
- **Ruta**: `/onboarding/status` · `/onboarding/bootstrap` · `/onboarding/start-tour` · `/onboarding/preview` · `/onboarding/preview/exit` · `/onboarding/step` · `/onboarding/complete` · `/onboarding/reopen` · `/onboarding/reseed-demo`
- **Auth**: Bearer token requerido. `bootstrap`: usuario sin membresía (`ROLE_USER`, o `ROLE_ADMIN` en preview). `preview`: solo `ROLE_ADMIN`. `start-tour` / `reseed-demo`: comercio `OWNER`/`ADMIN` (reseed).
- **Body / Params**: bootstrap `{ name, contactEmail?, contactPhone? }` · step `{ step }` · el resto `{}`
- **Respuesta esperada**: status `{ needsOnboarding, completed, hasTenant, mode: fresh|existing|preview, preview, tenant?, steps[{ id, kind, title, body, href, spotlight, ctaLabel, completeWhen?, skipIfExisting }], currentStep, demo?, canBootstrap, canStartTour }` · step `{ currentStep }` · bootstrap/preview/complete `{ token?, org?, onboarding }`
- **Estado**: IMPLEMENTADO
- **Notas**: Crea `Tenant` RETAILER `plan=BASE` con suscripción `TRIAL` (14 días; el preview del superadmin entra en `PRO` por cortesía), membresía `OWNER`, distros demo + ~10 ofertas con foto/ficha + 2 pedidos. `currentStep` (guardado en `User.onboardingStep` con `POST /onboarding/step`) es la única fuente de verdad del paso; `start-tour` y `complete` lo limpian. `start-tour` salta el alta (`onboardingReplay`). Preview superadmin: guarda Administración, suelta membresía, onboarding desde 0, al completar restaura. Demo Norte/Sur solo se ven durante el recorrido (alta, repaso o preview): no entran al Directorio ni a `/my/providers` de quien ya terminó. `/onboarding` solo crea el comercio; la guía corre dentro de la app sin bloquear (spotlight `data-tour`). Ver `docs/PLAN_ONBOARDING.md`.

### [FEATURE] Renovar sesión (JWT)
- **Método**: POST
- **Ruta**: `/auth/refresh`
- **Auth**: Bearer token requerido (el actual tiene que seguir siendo válido)
- **Body / Params**: `{}` (Fastify rechaza un JSON vacío)
- **Respuesta esperada**: `{ token }`
- **Estado**: IMPLEMENTADO
- **Notas**: Alarga la sesión mientras la pestaña está abierta. No revive un JWT ya vencido. Si hay suplantación, reemite con el mismo `impersonatedBy` y TTL de 1h. El default de `JWT_EXPIRES_IN` es `12h` (antes `15m`): con 15 minutos, el primer toque al carrito (varias APIs de checkout) disparaba 401 y el front echaba al usuario. La cookie `tgs_auth` del middleware se alinea al `exp` del token.

### [FEATURE] Banners con slot de grid
- **Método**: GET | POST | PUT | DELETE (admin) · GET público `/banners`
- **Ruta**: `/banners`, `/admin/banners`, `/admin/banners/:id`
- **Auth**: Bearer (admin para CRUD) · Bearer usuario para listado activo
- **Body / Params**: `position` (`home` | `search`), `slot` opcional (`hero_main`, `hero_side`, `tile_1`…`tile_4`, `strip`), `imageUrl`, `title`, `subtitle`, `linkUrl`, `order`, `active`
- **Respuesta esperada**: `Banner[]` o `Banner`
- **Estado**: IMPLEMENTADO
- **Notas**: El slot define la posición en el grid descontructurado del landing del buscador.

### [FEATURE] Identidad visual (preset de color)
- **Método**: GET | PUT
- **Ruta**: `/platform/settings` (público autenticado) · `/admin/platform/settings` (admin)
- **Auth**: Bearer token requerido
- **Body / Params**: `{ brandPreset: "violet" | "gamer_red" | "ocean" | "emerald" }`
- **Respuesta esperada**: `{ id: "platform", brandPreset: string }`
- **Estado**: IMPLEMENTADO
- **Notas**: El frontend aplica el preset como CSS variables (`--brand-*`).

### [FEATURE] Gestión completa de usuarios (admin)
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: `/admin/users`, `/admin/users/:id`, `/admin/users/:id/password`, `/admin/users/:id/email`, `/admin/users/:id/superadmin`, `/admin/users/:id/active-status`, `/admin/users/:id/end-date`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**: crear (solo superadmins) `{ username, email, password?, active?, endDate? }` · editar `{ username?, email? }` · superadmin `{ superadmin: boolean }` · password `{ password? }` (mín. 8)
- **Respuesta esperada**: lista enriquecida con `brand`, `providers` (nombres, sin secretos), `brandAccesses`
- **Estado**: IMPLEMENTADO
- **Notas**: Un usuario = una cuenta que pertenece a una o más organizaciones con un rol; ese rol define qué puede hacer. Los miembros se crean y asignan por `/admin/tenants/:id/members*`; `POST /admin/users` solo da de alta superadmins (el único usuario sin organización). El nivel de plataforma no se elige a mano: `PUT .../superadmin` lo prende o, al apagarlo, lo recalcula desde la organización (marca → `ROLE_BRAND`, resto → `ROLE_USER`); no deja a la plataforma sin superadmin activo. `GET /me/permissions` devuelve los módulos del nivel de plataforma, sin excepciones por usuario (se quitaron `GET/PUT /admin/permissions/:userId` y las rutas viejas `/user/update-active-status`, `/user/update-end-date`, `/user/delete`). `GET /admin/users` no devuelve hashes ni credenciales de distribuidores. `endDate: null` limpia el vencimiento. Al crear o resetear sin `password`, la plataforma genera una y la devuelve en `generatedPassword`; como solo se guarda el hash, esa es la única vez que puede leerse. Altas de admin y de equipo nacen con el email ya verificado. `POST /admin/users/:id/email` manda un aviso al mail de la cuenta (sin baja). En la UI vive en el **Directorio** (`/admin`): ficha del usuario (cuenta, superadmin, clave, “Entrar como”, organizaciones).

### [FEATURE] Permisos por organización
- **Método**: GET | PUT
- **Ruta**: `/my/permissions`, `/my/team/permissions`, `/my/team/roles/:role/permissions`, `/my/team/members/:membershipId/permissions` · superadmin: `/admin/tenants/:id/permissions`, `/admin/tenants/:id/roles/:role/permissions`, `/admin/tenants/:id/members/:membershipId/permissions`
- **Auth**: Bearer. Ver la matriz: permiso `team.manage`. Cambiarla: solo el Dueño (o superadmin en `/admin`).
- **Body / Params**: PUT `{ changes: { "<permiso>": true | false | null } }` (`null` = volver al valor heredado)
- **Respuesta esperada**: `/my/permissions` → `{ role, permissions: string[] }`. La matriz → `{ type, roles, groups, permissions: [{ key, group, label, description }], defaults, roleOverrides, members: [{ membershipId, userId, username, email, title, role, overrides, effective }], canEdit }`
- **Estado**: IMPLEMENTADO
- **Notas**: Catálogo en `packages/shared/src/permissions.ts`; diseño en `docs/superpowers/specs/2026-09-26-permisos-por-organizacion-design.md`. El Dueño tiene siempre todo. Resolución: persona > rol > defecto; los defectos reproducen los permisos fijos de antes. Credenciales (`/credentials*`), sync, configuración de proveedor y listas requieren `providers.manage`; sin él, `GET /credentials/me` devuelve `credentialsJson: null`. Cuenta corriente y pagos requieren `providers.account` (abierto por defecto).

### [FEATURE] Alta de comercio desde superadmin
- **Método**: POST
- **Ruta**: `/admin/onboarding/retailers`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**: `{ name, contactEmail?, contactPhone?, ownerUsername, ownerEmail, ownerPassword?, plan?: "BASE"|"PRO"|"CUSTOM", billing?: "ACTIVE"|"TRIAL"|"COURTESY", firstBillingAt?, courtesyUntil?: string|null, courtesyReason? }`
- **Respuesta esperada**: `{ tenant: { id, name, type, plan }, owner: { id, username, email }, generatedPassword? }`
- **Estado**: IMPLEMENTADO
- **Notas**: Deja el comercio como el autoregistro (dueño, catálogo demo) pero con el plan que elige Administración: por defecto `PRO` pago (`billing=ACTIVE`, primer vencimiento en un mes o `firstBillingAt`). `COURTESY` sin `courtesyUntil` = cortesía indefinida. `CUSTOM` deja la puesta en marcha pendiente. Ver `docs/PLAN_SUSCRIPCIONES.md`; el recorrido guiado arranca en su primer ingreso. Sin `ownerPassword` la plataforma genera una y la devuelve una única vez.

### [FEATURE] Entrar como otro usuario (suplantación)
- **Método**: POST
- **Ruta**: `/admin/users/:id/impersonate`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**: sin cuerpo (mandar `{}`: Fastify rechaza un `content-type` JSON vacío)
- **Respuesta esperada**: `{ token, user: { id, username, email, role, active, brandId? } }`
- **Estado**: IMPLEMENTADO
- **Notas**: El token vale 1 hora y agrega al payload `impersonatedBy` e `impersonatedByUsername`, para que toda acción de esa sesión sea atribuible al administrador. Se rechaza contra otro `ROLE_ADMIN`, contra uno mismo, y desde una sesión ya suplantada. Cada uso queda en `AuditLogEntry` con acción `IMPERSONATE`.

### [FEATURE] Árbol de organizaciones (multi-tenant)
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: `/admin/tenants`, `/admin/tenants/:id`, `/admin/tenants/:id/members`, `/admin/tenants/:id/members/new-user`, `/admin/tenants/members/:membershipId`, `/admin/tenants/members/:membershipId/managed-brands`, `/admin/tenants/links`, `/admin/tenants/links/:linkId`, `/admin/tenants/:id/access-codes`, `/admin/tenants/access-codes/:codeId`, `/admin/tenants/users/:userId/relations`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**: organización `{ name, type: "RETAILER" | "DISTRIBUTOR" | "BRAND", providerKey?, brandId?, contactEmail?, contactPhone?, notes?, advertisingEnabled?, active?, mirrorsCommercialFromId? }` · membresía `{ userId | (username, email, password), role, title? }` · vínculo `{ clientTenantId, supplierTenantId, accountManagerId?, status?, discountPercent?, notes? }` · código `{ label?, maxUses?, expiresInDays? }`
- **Respuesta esperada**: `GET /admin/tenants` devuelve `{ tenants: TenantNode[], unassignedUsers: [] }`, cada `TenantNode` con `members`, `suppliers`, `clients` y `accessCodes`
- **Estado**: IMPLEMENTADO
- **Notas**: `tenantRole` es el alcance dentro de la organización y `platformRole` el nivel de acceso a Nodo. El lado cliente del vínculo es un comercio, o un distribuidor cuando el proveedor es una marca. `mirrorsCommercialFromId` hace que credenciales, vínculos y catálogo se lean de otra organización; carrito y pedidos siguen siendo propios. Superadmin: una sola herramienta **Directorio** (organizaciones y personas). Las distros de onboarding (`LIST_DEMO_*`) no se listan. Ver `docs/ARQUITECTURA_TENANTS.md`.

### [FEATURE] Proveedores visibles y canje de código de vinculación
- **Método**: GET | POST
- **Ruta**: `/my/providers`, `/my/redeem-code`
- **Auth**: Bearer usuario con organización
- **Body / Params**: canje `{ code }`
- **Respuesta esperada**: `VisibleProvider[]` con `{ provider, name, linked, advertised, accountManager, discountPercent, linkId, inSearch, includeInSearch }` · canje `{ linkId, tenantName, tenantType, provider }` recién después de canjear
- **Estado**: IMPLEMENTADO
- **Notas**: `/my/providers` es la única fuente de qué proveedores existen para un comercio. Cada fila trae `platformHidden: boolean`: el superadmin lo ocultó en toda la plataforma (`ProviderDisplayConfig.visible=false`); el vínculo sigue pero la búsqueda y el catálogo responden vacío, así que el buscador no lo ofrece como filtro ni lo consulta. Nunca es `true` para un proveedor por lista (`LIST_*`) ni para uno que el comercio conectó cargando su propia lista (`selfConnected`): el interruptor global apaga integraciones de la plataforma, no la lista que trajo el comercio. Todos los rechazos del canje responden lo mismo para que no se puedan enumerar códigos ni organizaciones. `inSearch` dice si el proveedor participa del buscador agregado según el plan (NODO Base: hasta 5 a la vez); `includeInSearch` es la elección guardada (`true`/`false`/`null`). El front filtra el buscador con `linked && !platformHidden && inSearch !== false`.

### [FEATURE] Percepción aprendida del portal del proveedor
- **Método**: POST
- **Ruta**: `/my/providers/:provider/observed-iibb`
- **Auth**: Bearer usuario con organización
- **Body / Params**: `{ percent }` (0–100; `0` = el portal no cotiza percepción)
- **Respuesta esperada**: `PurchasePolicyView` del proveedor, ya con `learnedIibbPercent` y `learnedIibbAt`
- **Estado**: IMPLEMENTADO
- **Notas**: El carrito es el único lugar donde el sistema le pregunta la percepción al portal, y solo pregunta por los proveedores que tienen items adentro. Guardarla por comercio en el servidor es lo que hace que la búsqueda la siga mostrando cuando pasa el tiempo sin armar un carrito de ese proveedor, y que valga desde cualquier sesión. El `manualIibbPercent` cargado en Configuración le sigue ganando.

### [FEATURE] Formas de pago con descuento o recargo
- **Método**: PUT (alta y edición) · POST (aprendizaje)
- **Ruta**: `/providers/:provider/config` (campo `paymentOptions`) · `POST /my/providers/:provider/observed-payment-options`
- **Auth**: Bearer usuario con organización
- **Body / Params**: `paymentOptions: [{ id?, label, percent, kind: "DISCOUNT" | "SURCHARGE" }]` — lista completa, lo que no venga se borra. El POST manda `{ options }` con la misma forma.
- **Respuesta esperada**: `ProviderConfig` con `paymentOptions` normalizadas · el POST devuelve el `PurchasePolicyView` del proveedor
- **Estado**: IMPLEMENTADO
- **Notas**: Son **solo informativas**: NODO no elige la forma de pago ni la manda al confirmar el carrito, igual que el precio de esquema o el de offline. Se muestran como otra opción de precio en las cards y en la ficha; un recargo nunca tacha el precio final. Lo que informa el portal al cotizar entra por el POST y no pisa lo cargado a mano.

### [FEATURE] Salud del sistema (superadmin)
- **Método**: GET
- **Ruta**: `/admin/health/overview?hours=24` (1 a 720)
- **Auth**: Bearer ROLE_ADMIN (sin sesión 401, usuario común 403)
- **Body / Params**: `hours`
- **Respuesta esperada**: `{ generatedAt, hours, status: { level: ok|warning|critical, reasons[] }, runtime, traffic: { requests, ok, clientErrors, serverErrors, rateLimited, unauthorized, failedLogins, serverErrorRate, avgMs, timeline[], topErrorRoutes[], slowestRoutes[] }, recentErrors[], syncErrors[], jobs, integrity[], security, config }`
- **Estado**: IMPLEMENTADO
- **Notas**: El API cuenta cada respuesta por hora, ruta y código (tabla ApiMetric, volcado en lote cada minuto) y guarda los 5xx con su mensaje (ApiErrorEvent); se conserva 30 días. La configuración se informa como presente/ausente, nunca el valor.

### [FEATURE] Envío estimado por distribuidor
- **Método**: GET (estimación) · PUT (formas de envío a mano)
- **Ruta**: `GET /my/shipping-estimates` · `PUT /providers/:provider/config` (campo `shippingMethods`)
- **Auth**: Bearer usuario con organización
- **Body / Params**: `shippingMethods: [{ label, amount, currency: "ARS" | "USD", habitual? }]` — lista completa, lo que no venga se borra. Una sola puede ser `habitual`.
- **Respuesta esperada**: `[{ provider, estimate: { id, label, pickup, amount, currency, source: "manual" | "history", orders, ofOrders } | null, learned: { orders, methods: [{ id, label, pickup, orders, lastAmount, currency, lastAt }] }, manual: ShippingMethod[] }]`
- **Estado**: IMPLEMENTADO
- **Notas**: Lo aprendido sale de los últimos 30 pedidos por distribuidor (180 días, sin offline): la forma más usada y su último costo informado (New Bytes en pesos, Elit en dólares). Manda la habitual marcada a mano; si no, la más usada, con el valor cargado a mano si coincide el nombre. El reparto por producto (unidades, valor o pedido) y el filtro "Incluir envío" son preferencias del navegador. Es una estimación: el costo real lo da el portal en el checkout.

### [FEATURE] Equipo de la organización (Tipo 1 autónomo)
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: `/my/org` · `/my/team` · `/my/team/:membershipId` · `/my/team/:membershipId/password` · `/my/team/:membershipId/managed-brands`
- **Auth**: Bearer, organización de la sesión. Mutaciones: `OWNER` o `ADMIN` interno.
- **Body / Params**: alta `{ username, email, password?, role, title? }` (sin password la plataforma genera una y la devuelve una vez) · edición `{ role?, title?, active? }`
- **Respuesta esperada**: org `{ id, name, type, plan, demoSeededAt?, tenantRole, canManageTeam, canManagePortfolio, ... }` · team `{ canManage, members: TenantMember[] }`
- **Estado**: IMPLEMENTADO
- **Notas**: El dueño del comercio (y el del distribuidor) arma su equipo sin el árbol de superadmin. Un `ADMIN` no crea ni toca a un `OWNER`. No se puede quitar al último dueño ni a uno mismo. Contacto de la org: `PUT /my/org`. UI: `/equipo`. Alta self-serve del primer OWNER: `docs/PLAN_ONBOARDING.md`.

### [FEATURE] Cartera y códigos del distribuidor (Tipo 2)
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: `/my/clients` · `/my/clients/:linkId` · `/my/clients/orders` · `/my/access-codes` · `/my/access-codes/:codeId`
- **Auth**: Bearer, organización `DISTRIBUTOR`. Un `SELLER` solo ve (y edita descuento/notas de) las cuentas asignadas.
- **Body / Params**: cliente `{ accountManagerId?, status?, discountPercent?, notes? }` · código `{ label?, maxUses?, expiresInDays? }`
- **Respuesta esperada**: cartera `{ canManage, canAssignSeller, canEditTerms, sellers, clients: [{ linkId, client, accountManager, discountPercent, ordersCount, lastOrderAt, lastOrderTotal, inactive }] }` · detalle con `orders[]` · códigos `{ canManage, codes }`
- **Estado**: IMPLEMENTADO
- **Notas**: La navegación de un distribuidor no muestra búsqueda ni carrito. Un `PRODUCT_MANAGER` ve por defecto pedidos de las marcas de su `ProductManagerScope`; `GET /my/clients/orders?scope=all` abre toda la cartera. Un comercio activo sin pedido en 30 días llega marcado `inactive`. `GET /my/access-codes` es solo `OWNER`/`ADMIN` (el vendedor no lista secretos). UI: `/clientes`, `/codigos`, `/pedidos`. Ver `docs/PLAN_TIPO2.md`.

### [FEATURE] Chat comercial (persona a persona)
- **Método**: GET | POST | PATCH | DELETE | SSE
- **Ruta**: `/my/chat/threads` · `/my/chat/unread` · `/my/chat/search` · `/my/chat/peers` · `/my/chat/open` · `/my/chat/share-order` · `/my/chat/threads/:threadId` · `/my/chat/threads/:threadId/messages` · `/my/chat/threads/:threadId/read` · `/my/chat/threads/:threadId/typing` · `/my/chat/threads/:threadId/pins` · `/my/chat/messages/:messageId` · `/my/chat/messages/:messageId/reactions` · `/my/chat/upload` · `/my/chat/stream`
- **Auth**: Bearer, organización `RETAILER`, `DISTRIBUTOR` o `BRAND`. El visor solo lee. SSE autentica con `?token=` porque `EventSource` no manda `Authorization`.
- **Body / Params**: abrir `{ linkId, peerUserId? }` · peers `?linkId=` · enviar `{ body?, kind?, payload?, replyToId? }` · reaccionar `{ emoji }` (`👍 ✅ 👀 ❓ 🔥 ❤️`) · avisar pedido `{ orderId, threadId? }` · adjunto `multipart` foto/PDF/Excel ≤ 10 MB
- **Respuesta esperada**: lista `{ canWrite, unreadTotal, threads: [{ threadId, linkId, peer: { userId, username, roleLabel, orgName, ... }, lastMessage, unreadCount, peerOnline }] }` · hilo igual · peers `{ peers: [{ userId, username, roleLabel, isAccountManager, isDefault, hasThread }] }`
- **Estado**: IMPLEMENTADO
- **Notas**: Un hilo es **dos personas** dentro de un `TenantLink` (`distroUserId` = persona del proveedor, `storeUserId` = persona del cliente; el proveedor puede ser distro o marca). Un distro puede estar de los dos lados: proveedor frente al local, cliente frente a una marca. Nadie ve el chat de un compañero. “Hablar” sin `peerUserId` abre con el vendedor asignado (desde el cliente) o el dueño/comprador del otro lado. En pantalla: organización, nombre de usuario y rol (vendedor, PM, comprador, comercial, etc.) en ambos lados. En el comercio escriben `OWNER`/`ADMIN`/`BUYER`; el `SELLER` del local solo lee. En el distribuidor escriben `OWNER`/`ADMIN`/`SELLER`/`PRODUCT_MANAGER`. En la marca escriben `OWNER`/`ADMIN`/`MARKETING`/`COMMERCIAL`. `REVOKED` no se habla; `SUSPENDED` sí. El hub SSE usa Redis (`REDIS_URL`) cuando hay más de una réplica. UI: `/mensajes`. Ver `docs/PLAN_TIPO2.md` y `docs/PLAN_TIPO3.md`.

### [FEATURE] Tipo 3 — espacio in-app, mapa de SKUs, materiales y acciones
- **Método**: GET | PUT | POST | DELETE
- **Ruta**: `/my/brand/landing` · `/my/brand/catalog` · `/my/brand/signals` · `/my/brand/signals/:id` · `/my/brand/signals/import` · `/my/brand/resources` · `/my/brand/resources/:id` · `/my/brand/actions` · `/my/brand/actions/:id` · `/my/brand/actions/:id/status` · `/my/brand/accounts` · `/my/brand/notes` · `/my/brands` · `/my/brands/:linkId` · `/my/notifications` · `/my/notifications/:id/read` · `/my/notifications/send` · `/public/brands/:publicKey` · `/admin/brands/sync` · `GET /search/provider/:p?name=&brand=`
- **Auth**: Bearer con organización `BRAND` (panel), `RETAILER` o `DISTRIBUTOR` (hub/avisos; el distro como cliente de la marca), o `DISTRIBUTOR`/`BRAND` (avisar a una cuenta cliente vinculada). Landing pública: sin auth. Sync: `ROLE_ADMIN`. Canje de código: `RETAILER` o `DISTRIBUTOR` (el distro solo códigos de `BRAND`).
- **Body / Params**: acción `{ kind: PURCHASE_QTY|PURCHASE_AMOUNT|REBATE, title, description?, startsAt, endsAt, targetQty?, targetAmountUsd?, rewardKind: NONE|FLAT|PER_UNIT, rewardUsd?, notifyRetailers?, scopes?: [{ kind: DISTRIBUTOR|RETAILER|PRODUCT, refId }] }` · estado `{ status: ACTIVE|ENDED|CANCELLED }` · espacio `{ published?, headline?, about?, logoUrl?, heroUrl?, websiteUrl?, supportEmail?, supportPhone?, blocks?, html?, primaryColor?, backgroundColor?, textColor?, fontFamily? }` · semáforo `{ provider, externalId, light?: GREEN|YELLOW|RED|BLUE|GRAY, suggestedPrice?, qtyEstimate?, incomingAt?, notes? }` · import `{ csv }` · recurso `{ kind: MATERIAL|TRAINING, type, title, description?, fileUrl?, contentUrl? }` · aviso `{ retailerTenantId, title, body }` (`retailerTenantId` es el tenant cliente: comercio o distro) · catálogo `?q=&provider=&take=` · búsqueda `?brand=` filtra por marca del producto
- **Respuesta esperada**: acciones `{ canWrite, actions: [{ ..., progress: { current, target, ratio, met } }] }` · espacio `{ name, publicKey, publicPath, published, html, primaryColor, ... }` · catálogo `{ canWrite, products: [{ provider, providerName, externalId, name, sku, imageUrl, selected }] }` · mapa `{ canWrite, signals: [{ light, suggestedPrice, ... }] }` · recursos `{ canWrite, resources }` · marcas vinculadas `{ brands: [{ linkId, name, status, connectedAt, landing, signalCount, unreadNotices, presence, actions }] }` · hub `{ linkId, name, status, connectedAt, presence, theme, contact, htmlDocument, htmlSlots, htmlParts, signals, actions, materials, trainings, news }` · landing pública `{ name, headline, about, logoUrl, heroUrl, primaryColor, htmlDocument, htmlSlots, products: [{ name, imageUrl }], actions: [{ title, description, startsAt, endsAt }], news, materials: [{ title, description }], trainings, blocks }` · cuentas `{ retailers, linkedDistributors, distributors }` · sync `{ terms, created, linked, users }`
- **Estado**: IMPLEMENTADO
- **Notas**: Cada término de catálogo `BRAND` tiene Tenant + dueño placeholder (`managedByPlatform`). La marca no carga productos: elige SKUs de `ProviderSyncCache` de su marca y les pone overlay (semáforo + precio sugerido). No ve precios ni stock live de comercios. HTML del espacio conserva CSS (`<style>`, class, style inline, hojas https); se sacan script/iframe/on*. Se pinta **por encima** de la identidad de Nodo (Shadow DOM). Huecos `{{productos}}` `{{semaforos}}` `{{acciones}}` `{{novedades}}`/`{{noticias}}` `{{materiales}}` `{{capacitaciones}}` `{{hablar}}` `{{nombre}}` `{{logo}}`. El hub `/marcas/:linkId` es **una landing**: hero + módulos. Si hay HTML propio, es el cuerpo de esa misma landing (los huecos reciben los módulos; si falta un hueco se agrega al final del documento). No hay una segunda página abajo. Los botones usan `scrollIntoView` (el shell no scrollea con hash). Un botón muerto del HTML salta al bloque. Landing `/m/:publicKey` es la misma página con recorte de marketing (nombre+imagen, acciones sin progreso, notas `isPublic`, sin archivos ni distros). Chat distro↔marca: el distro es `clientTenant` y habla como `storeUserId`. UI comercio: `/marcas` (conectadas) y `/marcas/:linkId`. `presence.pending` = vínculo sin contenido publicado. UI marca: `/marca`, `/marca/productos`, `/marca/materiales`, `/marca/capacitaciones`, `/marca/acciones`, `/marca/landing`, `/marca/cuentas`, `/avisos`, `/noticias`, `/search?marca=`. Ver `docs/PLAN_TIPO3.md`.

### [FEATURE] Tipo 3 — productos de la marca y semáforo por distribuidor
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: `GET /my/brand/items` · `GET /my/brand/items/suggestions` · `POST /my/brand/items` · `PUT|DELETE /my/brand/items/:id` · `POST /my/brand/items/:id/links` · `PUT|DELETE /my/brand/item-links/:linkId` · `PUT /my/brand/stock-settings` · `GET /my/brands/:linkId/availability` · `GET /public/brands/:publicKey/availability`
- **Auth**: panel: Bearer con organización `BRAND` (escribir requiere `brand.manage`). Disponibilidad vinculada: `RETAILER` o `DISTRIBUTOR` con vínculo a la marca. Pública: sin auth (solo si la landing está publicada).
- **Body / Params**: alta `{ items: [{ name, partNumber?, ean?, imageUrl?, skus: [{ provider, externalId }] }] }` · producto `{ name?, referencePrice?: number|null, currency?: USD|ARS, state?: INCOMING|DISCONTINUED|null, incomingAt?, notes?, imageUrl?, active? }` · código `{ provider, externalId }` · luz manual `{ manualLevel: NONE|LOW|MEDIUM|HIGH|null }` · configuración `{ mode?: AUTO|MANUAL, lowBelow?, highFrom?, brandSeesExact?, publicStock? }`
- **Respuesta esperada**: panel `{ settings, canWrite, items: [{ id, name, imageUrl, partNumber, ean, referencePrice, currency, state, incomingAt, notes, distributors: [{ provider, label, status, linkId, manualLevel, stock? }] }] }` (los cambios devuelven la vista entera) · sugerencias `{ items: [{ name, ean, partNumber, imageUrl, skus: [{ provider, externalId, name, label }] }] }` · vinculada `{ mode, items }` con `distributors[].yours` (primero los del comercio) · pública `{ mode, items, hidden }`. `status`: `NONE|LOW|MEDIUM|HIGH|INCOMING|DISCONTINUED|UNKNOWN`.
- **Estado**: IMPLEMENTADO
- **Notas**: Reemplaza al mapa de señales por SKU (`/my/brand/signals`, que queda solo por compatibilidad; la migración `20260929010000_brand_items` pasó las señales a productos). Un producto de la marca agrupa sus códigos en cada distribuidor (sugeridos por EAN / part number). Automático: el nivel sale del stock sincronizado más reciente con los rangos de la marca; sin sincronización en 48 h es `UNKNOWN`. Manual: la luz que elige la marca por distribuidor. El estado del producto (próximo ingreso, discontinuado) pisa todo. Unidades exactas solo para la marca y solo si `brandSeesExact`; comercios y público ven rangos. El hub `/my/brands/:linkId` ahora trae `availability` y `stockMode` en lugar de `signals`, y la landing pública arma `products` desde los productos de la marca. UI: `/marca/productos`, sección Productos de `/marcas/:linkId` y `/m/:publicKey`. Diseño: `docs/superpowers/specs/2026-09-29-marcas-semaforo-design.md`.

### [FEATURE] Tipo 3 — vincularse con la marca desde su link público
- **Método**: GET | POST
- **Ruta**: `GET /my/brands/by-landing/:publicKey` · `POST /my/brands/by-landing/:publicKey/link` · `PUT /my/brand/landing` (campo `allowPublicLink`)
- **Auth**: Bearer con organización `RETAILER` o `DISTRIBUTOR` (la marca edita `allowPublicLink` en su landing).
- **Body / Params**: `publicKey` de la landing publicada.
- **Respuesta esperada**: estado `{ state: "LINKED", linkId, brandName } | { state: "CAN_LINK", brandName } | { state: "CLOSED", brandName, reason }` · vincular `{ linkId, brandName, created }` · la landing pública agrega `allowLink`.
- **Estado**: IMPLEMENTADO
- **Notas**: El link público es la puerta de entrada: quien lo recibió vincula su organización sin código (comercio → marca, o distro → marca). Solo si la landing está publicada y `allowPublicLink` (por defecto sí). Un vínculo que la marca revocó no se reabre desde el link (ahí hace falta código). Sin sesión, `/m/:publicKey` guarda el pedido en el navegador (`nodo.pendingBrandLink`, 7 días) y manda a crear cuenta o entrar; al volver, la app muestra "¿Vinculamos tu organización con la marca?".

### [FEATURE] Eventos y lanzamientos de la marca
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: `POST|PUT /my/news` (campos nuevos) · `GET|POST|DELETE /news/:id/rsvp` · `GET /my/brands/:linkId` y `GET /public/brands/:publicKey` (agregan `launches` y `events`)
- **Auth**: Bearer con organización (anotarse: quien ve la nota; el autor no se anota a su propio evento). Landing pública: sin auth.
- **Body / Params**: nota `{ kind: "EVENT", eventStartsAt, eventEndsAt?, eventLocation?, eventUrl?, rsvpEnabled? }` · lanzamiento `{ kind: "LAUNCH"|"INCOMING", brandItemId }` (producto de la propia marca).
- **Respuesta esperada**: nota `{ ..., event: { startsAt, endsAt, location, url, rsvpEnabled } | null, brandItemId }` · inscripción `{ enabled, count, mine, attendees?: [{ tenantId, name, people }] }` (`attendees` solo para el autor) · `launches: [{ id, name, imageUrl, partNumber, referencePrice, currency, incomingAt, note: { id, title, excerpt, path } | null }]` · `events: [{ id, title, excerpt, coverUrl, startsAt, endsAt, location, url, rsvpEnabled, attending, path }]`
- **Estado**: IMPLEMENTADO
- **Notas**: Un evento no se publica sin fecha de inicio. El link público nunca lleva el link de la reunión ni inscripción. Lanzamiento = producto de la marca en "Próximo ingreso" + la última nota publicada que lo presenta (en el link público solo notas `isPublic`). Eventos listados: los que no terminaron (sin fin, durante el día en que empiezan). Hueco nuevo `{{lanzamientos}}` en el HTML de la marca (se agrega al final si falta). "Presentar el lanzamiento" en `/marca/productos` abre `/noticias/nueva?tipo=LAUNCH&producto=<id>`.

### [FEATURE] Eventos: confirmación de asistencia, cupo y avisos
- **Método**: GET | POST | DELETE
- **Ruta**: `POST /news/:id/rsvp` (responder) · `GET /news/:id/rsvp` · `DELETE /news/:id/rsvp` · `GET /my/news/:id/attendees` · `POST /my/news/:id/remind`
- **Auth**: Bearer. Responder: quien ve la nota (no el autor). Lista y avisos: la organización autora.
- **Body / Params**: responder `{ status: GOING|NOT_GOING, people?: 1..20, note? }` · aviso `{ audience: "going"|"linked", message? }` · nota: `eventCapacity?`, `rsvpDeadline?`, `eventReminder?` (por defecto sí).
- **Respuesta esperada**: resumen `{ enabled, count (personas que van), notGoing, mine, myResponse, capacity, spotsLeft, deadline, closedReason, attendees? }` · lista `{ items: [{ organization, person, email, status, people, note, answeredAt }] }` · aviso `{ sent }`.
- **Estado**: IMPLEMENTADO
- **Notas**: No se puede confirmar después de la fecha límite ni con el evento empezado; con cupo, se rechaza si no alcanza. Recordatorio automático (cron cada 30 min) a quienes confirmaron, 24 h antes, una sola vez (`reminderSentAt`, reclamado con updateMany para varias réplicas). Los avisos llegan a Notificaciones de cada organización (`OrgNotification` kind NEWS). La galería de la nota muestra las imágenes enteras (flyers).

### [FEATURE] Estadísticas de la marca
- **Método**: GET
- **Ruta**: `GET /my/brands/:linkId/stats?months=3|6|12` (comercio) · `GET /my/brand/stats?months=3|6|12` (marca)
- **Auth**: Bearer. Comercio vinculado con permiso `orders.create` (ve montos). Marca: cualquier miembro.
- **Body / Params**: `months` (por defecto 12).
- **Respuesta esperada**: `{ months, totals: { spendUsd, units, orders, accounts }, byProvider: Rank[], topProducts: (Rank & { itemId })[], byAccount: Rank[], monthly: [{ month: "AAAA-MM", spendUsd, units }] }` con `Rank = { key, label, spendUsd, units, orders, share }`. La marca agrega `linkedAccounts: { retailers, distributors }` y `presence: { products, distributors: [{ provider, label, products, inStock, none, unknown, coverage }] }`.
- **Estado**: IMPLEMENTADO
- **Notas**: Cuenta pedidos `CREATED` y `OFFLINE` hechos por NODO (hasta 5000 por consulta). Una línea es de la marca si su código está asociado a un producto de la marca (y entonces se agrupa en él) o si el distribuidor lo publica con esa marca. El comercio solo ve sus propias compras; `byAccount` es solo para la marca y solo de cuentas vinculadas. UI: sección "Tus compras de {marca}" en `/marcas/:linkId` y `/marca/estadisticas`.

### [FEATURE] Pedidos de la organización y aprobación
- **Método**: GET | POST
- **Ruta**: `/orders`, `/orders/pending-approval`, `/orders/insights`, `/orders/:id/approve`, `/orders/:id/reject`
- **Auth**: Bearer usuario con organización · aprobar y rechazar, solo OWNER o ADMIN
- **Body / Params**: rechazo `{ reason? }` · insights `days` (`30` | `90` | `365` | `0` = todo el historial; default `90`)
- **Respuesta esperada**: pedido con `{ id, provider, providerName, status, approvalStatus, createdBy, approvedBy, total, items }` · `/orders/pending-approval` devuelve `{ canApprove, needsApproval, orders }` · `/orders/insights` es el tablero del comercio de la sesión
- **Estado**: IMPLEMENTADO
- **Notas**: Un vendedor que confirma un checkout recibe `status: "PENDING_APPROVAL"` y el pedido no se manda al proveedor. Al aprobarlo se reenvía el borrador guardado tal cual. Ver `docs/PLAN_AISLAMIENTO.md`. **Insights nunca cruza locales**: filtra siempre por `tenantId`. Solo cuenta pedidos `CREATED` u `OFFLINE`. El payload incluye `ops` (envíos, pagos, direcciones, sucursales, impuestos, autores) armado con lo que cada pedido ya guardó: no se inventan fletes.

### [FEATURE] Referencias de precio de venta (locales)
- **Método**: GET · POST (admin)
- **Ruta**: `/retail/search?q=&take=` · `/retail/products/:id` · `/admin/retail/ingest` · `/admin/retail/ingest/status` · `/admin/retail/stores` · `/admin/retail/stores/:id/products` · `/admin/retail/stores/:id/ingest`
- **Auth**: Bearer usuario · admin retail solo ROLE_ADMIN
- **Body / Params**: `q` búsqueda · listado de productos de local con `q/page/take` · ingest sin body
- **Respuesta esperada**: `{ query, tokens, results: [{ id, name, price, description, productUrl, imageUrl, categoryName, syncedAt, store: { name, logoUrl }, priceHistory: [...] }] }`
- **Estado**: IMPLEMENTADO
- **Notas**: La UI muestra “Precios de venta encontrados” / local (tienda). La app nunca consulta la fuente externa en vivo. Cron **cada 15 minutos de 06:00 a 23:00 AR** (locales + HardGamers/Compra Gamer). De 23:00 a 06:00 no corre. Staging no corre crons. Al levantar el API arranca a los 10 s si está en ventana. Si una corrida se cuelga (>15 min sin heartbeat) se libera el lock y el cron sigue. Admin “Sincronizar todo” hace **full en background hasta terminar**; si hay un batch del cron, lo cancela al cerrar la tienda actual y encola el full. Progreso en `RetailIngestRun` (`storesDone/storesTotal`, `currentStoreName`, `heartbeatAt`). Status `DEGRADED` = el agregador PrecioLíder no responde (TLS/503/red); no tumba la corrida y el full sigue con HardGamers/Compra Gamer. HardGamers ahora trae **todos** los locales de su portada (~57, no solo los 14 que faltaban): si el nombre coincide con un local ya cargado (p. ej. Rodk = Rocket Hard) se reusa y se actualiza el precio. El cron de HG usa ~96 páginas por ciclo (los más viejos primero); un full no tiene tope. Ingesta más rápida: páginas de 100, upserts en paralelo, sin persistir `raw` del producto, historial limitado. `priceDivisor` por local corrige centavos (Multiplo). `RETAIL_INGEST_DISABLED=true` o `CRON_DISABLED=true` apaga el cron. Ranking: si la query trae un SKU de modelo (`7600`, `7600x`, `rtx4060`), `7600` no matchea `7600X`; los resultados exactos se ordenan por precio.

### [FEATURE] Tienda web propia del comercio
- **Método**: GET | PUT | POST
- **Ruta**: `/my/own-store` · `/my/own-store/options` · `PUT /my/own-store` · `POST /my/own-store/quotes`
- **Auth**: Bearer. Solo organización `RETAILER`. Leer y cotizar: cualquier miembro. Elegir o quitar el local: permiso `providers.manage` (dueño o admin, salvo excepción).
- **Body / Params**: `PUT` `{ retailStoreId: uuid | null }`. `POST` `{ items: [{ key, name }] }` (1 a 40).
- **Respuesta esperada**: `GET /my/own-store` → `{ canEdit, store: { id, name, logoUrl, syncedAt, productCount } | null }`. `options` → esa lista de locales activos ya sincronizados. `quotes` → `{ store: { id, name, logoUrl } | null, quotes: [{ key, productId, name, price, currency, productUrl, imageUrl, syncedAt, coverage, confident }] }`. `price` es ARS publicado. `confident` es verdadero cuando el título parece el mismo producto (la card solo muestra esos).
- **Estado**: IMPLEMENTADO
- **Notas**: La tienda es de la organización, no de la persona. Un local que no está en `options` no se puede inventar: la UI arma un WhatsApp a `5491140859342` pidiendo la conexión gratis (no hay endpoint de solicitud). La comparación de la card y de la ficha resta el costo final que ya muestra NODO (con los impuestos activos y la cotización elegida) contra ese precio de venta. La app no consulta la web del local en vivo: usa el catálogo retail ya ingerido. Un distribuidor o una marca reciben 403.

### [FEATURE] Dashboard de compras del local (proveedores)
- **Método**: GET
- **Ruta**: `/orders/insights?days=`
- **Auth**: Bearer, organización de la sesión (el superadmin de prueba espeja el Comercio de Pruebas: ve ese catálogo; el tablero de compras es el de Administración)
- **Body / Params**: `days` opcional, default 90. `0` = todo el historial del comercio
- **Respuesta esperada**: `{ tenantName, periodDays, kpis, concentration, channelMix, byMonth, byMonthDay, byWeekday, byProvider, byBrand, byCategory, bySubcategory, brandProviders, topProducts, recentOrders, ops }`
- **Estado**: IMPLEMENTADO
- **Notas**: La data es **solo de ese local**. `ops` agrega envíos (retiro vs domicilio, flete por mes/proveedor), formas de pago, direcciones más usadas, sucursales, IVA/percepciones y quién armó el pedido. El flete **no se inventa ni se convierte**. New Bytes guarda la cotización en **ARS** (`shippingArs`); Elit/Invid/Air solo cuentan en **USD** si el pedido trajo `shippingCost` creíble. No se usa `total − subtotal − impuestos`: en Invid `impuestos` son internos y ese resto es IVA, no envío. El comercio puede **unificar** etiquetas de dirección/pago/entrega/sucursal (`PUT /orders/insights/aliases`, `PATCH/DELETE /orders/insights/aliases/:groupId`, `POST .../split`) para que distintas escrituras cuenten como una sola real; `ops.suggestions` propone pares que se parecen (sin unificar solo). `byMonthDay` suma por día 1–31 (hora de Argentina) para ver si se compra más a principio, mitad o fin de mes. Marcas/distribuidores/categorías traen ticket, mix portal/offline, evolución mensual, días de la semana, SKUs/marcas/categorías distintas, recompra y delta vs el período anterior.

### [FEATURE] Pedido offline y compras en esquema (comercio tipo 1)
- **Método**: GET | PUT · POST | PATCH (pedidos)
- **Ruta**: `/providers/:provider/config` · `GET /my/providers` (`purchase`) · `POST /orders/offline` · `PATCH /orders/:id`
- **Auth**: Bearer, organización comercio (RETAILER) para usarlas; la config la guarda el tenant actual. Pedidos: rol que puede armar pedidos.
- **Body / Params**: config `{ acceptsOffline?, acceptsScheme?, offlineIvaAdjustment?, schemeIvaAdjustment?, schemeDiscountPercent? }`. Alta offline `{ orders: [{ provider, notes?, quoteRate?, items: [{ externalId, name, qty, unitPrice, internosAmount?, ivaPercent?, internosPercent? }] }] }`. Edición `{ notes?, items? }`.
- **Respuesta esperada**: `ProviderConfig` / `purchase` por proveedor. `POST /orders/offline` y `PATCH /orders/:id` devuelven `TenantOrder` con `channel: "OFFLINE"`, `status: "OFFLINE"`, `approvalStatus: "APPROVED"`, `editable: true`.
- **Estado**: IMPLEMENTADO
- **Notas**: Offline = compra sin facturar (antes “.com”); **no se llama al portal del proveedor**. Sí se registra en Nodo como pedido **aprobado** y se puede editar (cantidades, precio, notas) si el vendedor cambia algo. El mensaje al vendedor se copia aparte. **Sin percepciones (IIBB); internos sí.** Esquema = facturado, con % extra que carga el comercio una vez por distribuidor (no aplica a ítems sueltos del carrito online); al portal los ítems van sueltos. **El esquema sí suma percepciones/IIBB** sobre el neto ya descontado, con la alícuota de ese comercio. El IVA de offline y el de esquema son independientes. Si offline está activo, `offlineIvaAdjustment` es obligatorio; si esquema está activo, `schemeIvaAdjustment` es obligatorio. Si el proveedor no informa alícuota de IVA (p. ej. Ceven), offline/esquema quedan deshabilitados: no se inventa 21%, 0% ni 10,5%. Aprobar un pedido offline está bloqueado: no hay envío al portal.

### [FEATURE] Unificar direcciones, pagos y envíos del local
- **Método**: PUT · PATCH · DELETE · POST
- **Ruta**: `PUT /orders/insights/aliases` · `PATCH /orders/insights/aliases/:groupId` · `DELETE /orders/insights/aliases/:groupId` · `POST /orders/insights/aliases/:groupId/split`
- **Auth**: Bearer, organización de la sesión (solo ese comercio)
- **Body / Params**: unificar `{ kind: "ADDRESS"|"PAYMENT"|"DELIVERY"|"WAREHOUSE", keys: string[], label }` · renombrar `{ label }` · split `{ keys }` (saca esas escrituras del grupo)
- **Respuesta esperada**: `{ groupId, kind?, label?, keys? }`. El GET `/orders/insights` aplica los alias: filas unificadas traen `groupId`, `unified`, `variants`; `ops.suggestions` lista parecidos sin unificarlos.
- **Estado**: IMPLEMENTADO
- **Notas**: No cruza locales. No se unifica en automático: el comercio elige. Las claves crudas son el texto que ya guardó cada pedido.


### [FEATURE] Catálogo paginado de un distribuidor
- **Método**: GET
- **Ruta**: `/providers/:provider/catalog?q=&skip=&take=&includeOutOfStock=`
- **Auth**: Bearer token requerido (sin organización responde vacío)
- **Body / Params**: `q` opcional (mismas palabras que la búsqueda; vacío lista todo), `skip` (default 0), `take` (default 50, máx. 200), `includeOutOfStock`.
- **Respuesta esperada**: `{ total: number, items: ProductDTO[] }` ordenado por nombre.
- **Estado**: IMPLEMENTADO
- **Notas**: Pestaña Catálogo de la ficha del proveedor. Mismas reglas que `/search/provider/:provider` (vínculo, visibilidad, stock, precio propio, `hideUnsyncedCatalog`): primero las ofertas del local y después, si corresponde, las fichas sin oferta. `GET /search/provider/:provider` sin `name` ni `brand` sigue devolviendo `[]`.
### [FEATURE] Búsqueda de catálogo oculta stock 0
- **Método**: GET
- **Ruta**: `/search/provider/:provider` · `/catalog/by-category` · `/catalog/by-brand` · `/catalog/featured` · `/catalog/categories` · `/catalog/brands`
- **Auth**: Bearer, organización de la sesión
- **Body / Params**: `name` (búsqueda) · `brand` (filtro de marca; si `name` vacío o igual a `brand`, solo filtra por marca) · `includeOutOfStock=true` para listar también ofertas con stock 0 (o debajo del umbral del comercio) · `category` / `brand` en by-category / by-brand
- **Respuesta esperada**: `ProductDTO[]` · categorías/marcas con conteo solo de ofertas con stock
- **Estado**: IMPLEMENTADO
- **Notas**: La ficha (`ProviderSyncCache`) es la misma para todos los locales de ese distribuidor: nombre, marca, foto y el resto de los datos del producto. Un local vinculado la ve aunque todavía no haya cargado la cuenta: en ese caso `price`, `finalPrice`, `stock` y `stockStatus` vienen `null` (no es stock 0 ni precio 0). El precio, el stock y el historial de quien ya sincronizó salen de su oferta (`TenantProductOffer`), la de su cuenta. Vincular no copia ofertas de otro comercio. Los importes que vengan en el JSON del proveedor no se guardan en la ficha ni se usan para mostrar el precio. Por defecto, si en ese distribuidor la config de stock 0 no es «Mostrar igual», no se listan productos con stock 0 (ni debajo del umbral). Las fichas sin oferta de este local sí se listan mientras el local no tenga ningún precio propio de ese distribuidor (vista previa antes de sincronizar o cargar la lista). En cuanto tiene al menos un precio propio de ese distribuidor, de ese distribuidor solo se listan ofertas con `price` o `finalPrice`: ni fichas sin oferta (las que trajo la cuenta de otro local o las que su propia sync borró) ni ofertas sin precio; aplica a búsqueda, `/catalog/by-*`, `/catalog/featured` y a los conteos de `/catalog/categories` y `/catalog/brands`. Además, si en Configuración de ese distribuidor está activo `hideUnsyncedCatalog`: entonces no se listan ni las fichas sin oferta, ni las ofertas que ese distribuidor mandó sin precio o sin stock. La ficha por link directo sigue existiendo. `includeOutOfStock=true` los incluye igual. La ficha individual (`GET /providers/:provider/products/:externalId`) sí los devuelve si se entra por link. Qué hacer en la sync con faltantes o stock 0 lo define cada proveedor (`missingProductAction`, `zeroStockAction`), no un comportamiento especial por marca. Marcas y categorías del catálogo son filtros generales del buscador (`/catalog/brands`, `/catalog/by-brand`), no facetas post-resultado. `/catalog/featured` son bajas de precio: un punto por día (Argentina), ventana de **7 días**. Prioriza el día más reciente y completa con jornadas anteriores hasta `take` (portada ~60; Ver todas ≥100). La búsqueda y los listados de catálogo adjuntan `priceDropPercent` / `priceDroppedOn` si el SKU bajó en esa ventana (filtro mid-search «Bajaron de precio», orden por % de descuento). `all` queda por compat y usa la misma ventana. El gráfico de ficha (`GET .../price-history`) dibuja **un punto por cada día** desde la primera captura hasta hoy (si un día no hubo sync, copia el último precio).

### [FEATURE] Progreso e historial de sincronización de catálogo
- **Método**: POST | GET
- **Ruta**: `POST /providers/:provider/sync` · `POST /providers/:provider/import` · `GET /providers/:provider/status` · `GET /providers/:provider/sync/current` · `GET /providers/:provider/sync/runs` · `GET /providers/:provider/sync/runs/:id`
- **Auth**: Bearer, organización de la sesión (el catálogo se lee/escribe de la org comercial)
- **Body / Params**: sync sin body · import `multipart` con `file` · runs `?take=` (default 20, máx. 50)
- **Respuesta esperada**:
  - POST sync (manual): `{ provider, runId, accepted: true, status: "RUNNING", synced: 0, created: 0, updated: 0, missingAffected: 0, zeroStockAffected: 0 }` — la corrida sigue en background
  - POST import / sync cron: `{ provider, synced, created, updated, unchanged, missingAffected, zeroStockAffected, runId }` al terminar
  - `status.currentRun`: última corrida (`RUNNING` | `OK` | `ERROR`) con contadores en vivo (`processed`, `expectedTotal`)
  - `sync/current`: igual, o `null` si nunca se sincronizó
  - `sync/runs`: lista de corridas (sin el detalle de productos)
  - `sync/runs/:id`: corrida + `changes[]` (`created` | `updated`, `changedFields`, `before`, `after`)
- **Estado**: IMPLEMENTADO
- **Notas**: Vale para **todos** los proveedores con sync (API, cron o Excel). `created` es oferta nueva de esa org; `updated` es cambio de nombre, marca, categoría, SKU, precio, stock o estado; el resto es `unchanged`. El POST manual **no espera** el catálogo: crea la corrida `RUNNING` y vuelve; el front pollea `status` / `current` hasta `OK` o `ERROR`. El cron (cada 30 min, 06:00–23:00 AR; apagado de noche y en staging) sí espera. Distecna informa `expectedTotal` con el `total` de `GET /Product` antes de persistir la primera página. Se guardan hasta 500 cambios por corrida. UI: `/proveedores` (barra + contadores) y pestaña Sincronización de cada proveedor (historial y qué cambió).

### [FEATURE] Módulo Catálogo (admin)
- **Método**: GET | POST | PATCH | PUT | DELETE
- **Ruta**: `/admin/catalog-enrichment/board` · `/terms` · `/link` · `/move` · `/visibility` · `/incomplete` · `/products/assign` · `/preview` · `/ai/suggest-merges` · `/ai/product-hint` · `/openai` · `POST /admin/catalog-enrichment/purge-air-codes` · `POST /admin/catalog-enrichment/repair-invid-encoding`
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**:
  - board `?kind=CATEGORY|BRAND|SUBCATEGORY`
  - link `{ kind, items:[{provider,rawKey}], label?|termId? }`
  - move `{ kind, from:{provider,rawKey}, toLabel?|toTermId?, deleteEmptySourceTerm? }`
  - terms CRUD `{ kind, label, parentId?, visible?, inMenu? }` (`inMenu` = está en el menú de Nodo; parentId arma padre/hija; no se permiten ciclos)
  - assign producto `{ provider, externalId, displayBrand?, displayCategory?, displaySubcategory? }` — el label puede ser **cualquiera**; si no existe el término, `ensureTerm` lo crea
  - preview `?kind&rawKey&provider?` **o** `?kind&termId` (productos de un grupo ya unificado)
- **Respuesta esperada**: board `{ rows, terms, stats }` · `stats.groupCount` = grupos con al menos un alias · incomplete `{ items, total }` · preview productos
- **Estado**: IMPLEMENTADO
- **Notas**: Lista todas las categorías/marcas crudas de todos los distribuidores. Vincular o trasladar productos a un término canónico (con visibilidad y jerarquía padre/hijo). Overrides por producto en `PlatformProductCatalogOverride` (no pelean con el sync). Air resuelve nombres en el sync (Rubro → categoría, Grupo → marca). `POST purge-air-codes` (también al abrir Catálogo y al terminar un sync de Air) borra ids viejos (`63`, `001-0010`) de fichas, alias y términos huérfanos; no toca nombres reales (HP, LOGITECH). Invid sirve el HTML en ISO-8859-1: si se leía como UTF-8 quedaba `Electrodom�sticos`. El adapter decodifica el charset real y `POST repair-invid-encoding` (al abrir Catálogo, al arrancar el API y al terminar un sync de Invid) reconstruye esas categorías/subcategorías del menú. El tablero no pide 3 productos de muestra por fila. Tras unificar no se vuelve a pedir sugerencias de IA (eso hacía reaparecer lo recién unificado). La API key de OpenAI se gestiona en **Configuración → Credenciales API** (`PUT/DELETE /admin/catalog-enrichment/openai`). La UI de Unificadas agrupa por `board.terms` (un renglón por nombre elegido, con `members` y productos). Al fusionar se elige uno de los nombres seleccionados; no hace falta inventar uno nuevo. Incompletos permite escribir o buscar cualquier marca/categoría de cualquier proveedor (no hace falta unificar). El **menú** se arma desde Categorías con `inMenu` + `parentId` (padre o hija); no hace falta unificar para mandarla.

### [FEATURE] Credenciales API (UI Configuración)
- **Método**: PUT | DELETE (mismos endpoints existentes)
- **Ruta UI**: `/configuracion?tab=credentials` (solo ROLE_ADMIN)
- **Auth**: Bearer ROLE_ADMIN
- **Body / Params**: OpenAI `{ apiKey }` · Serper `{ apiKey }`
- **Respuesta esperada**: `{ hasOpenAiKey }` · `{ hasSerperKey }`
- **Estado**: IMPLEMENTADO
- **Notas**: Centraliza las claves de OpenAI (catálogo/IA) y Serper (imágenes). Ya no se editan dentro de Admin → Catálogo ni Admin → Imágenes.

### [FEATURE] Sincronización de imágenes (Primera foto / Serper)
- **Método**: GET | PUT | DELETE | POST
- **Ruta**: `/admin/images/status` · `/admin/images/missing` · `/admin/images/history` · `/admin/images/serper` · `/admin/images/cron` · `/admin/images/first-photo` · `/admin/images/first-photo/stop` · `/admin/images/products/:productId/serper-search` · `/admin/images/products/:productId/image`
- **Auth**: Bearer ROLE_ADMIN (solo superadmin)
- **Body / Params**: guardar clave `{ apiKey }` · primera foto `{ provider?, batchSize?: 1–50, once?: boolean }` · missing `take`, `provider`
- **Respuesta esperada**: status `{ hasSerperKey, missing, pending, pendingVisible, pendingDeferred, filled, problems, running, byProvider, lastRun }` · first-photo `{ started, reason? }` · missing `{ items: [{ id, provider, name, query, inCatalog, ... }] }`
- **Estado**: IMPLEMENTADO
- **Notas**: Rellena `ProviderSyncCache.imageUrl` **solo si está vacío** (salvo edición manual). Busca en `POST https://google.serper.dev/images` (`X-API-KEY`, `gl=ar`, `hl=es`). **No guarda una URL rota**: descarga la foto, comprueba que sea JPEG/PNG/WebP/GIF usable y la persiste en `/assets/...`. Si la primera de Serper no carga, prueba las siguientes; si ninguna sirve, el producto queda `skipped` (sin foto) pero **sigue pendiente** para reintentar en la próxima corrida (manual o cron). Si Serper responde sin créditos, 429 o key inválida, la corrida **aborta** y **no** marca el producto como failed/skipped: queda pendiente. Corre en segundo plano de a tandas de 50. La API key se cifra y nunca se devuelve. Cada producto tocado queda en `ImageSyncFill` (historial editable). **Prioridad**: primero los que se muestran en algún catálogo (`TenantProductOffer.active` y `stock > 0`); sin stock, ocultos o sin oferta quedan para **después**. Candidatos = sin `imageUrl` y (nunca intentados **o** fill `failed`/`skipped`, excepto “Sin texto para buscar”). `problems` / historial `status=problems` = fallidos + sin resultado reintentables (UI Admin → Imágenes). Productos con foto Serper/serper_pick llevan `imageAiSelected: true` en búsqueda y ficha (leyenda “sugerida por IA”). **Editar**: `POST /admin/images/products/:productId/serper-search` `{ query? }` → `{ query, images[] }`; `PUT /admin/images/products/:productId/image` `{ imageUrl, source: serper_pick|upload }`. **Historial**: `GET /admin/images/history?page=&take=&status=&provider=&q=`. **Cron** 8:00 y 20:00 `America/Argentina/Buenos_Aires`, tope 200 por corrida (`IMAGE_SYNC_CRON_LIMIT`), se apaga con `IMAGE_SYNC_CRON_DISABLED=true` o `PUT /admin/images/cron { enabled }`. El sync de catálogo no borra una foto de Serper si el proveedor sigue vacío.

### [FEATURE] Carrito de la organización
- **Método**: GET | PUT
- **Ruta**: `/cart/org` · `/cart/clients/:linkId`
- **Auth**: Bearer, organización. `GET/PUT /cart/org` es del comercio (`RETAILER`). `GET /cart/clients/:linkId` es del distribuidor, sobre un vínculo visible.
- **Body / Params**: `{ items: CartItem[], schemes: CartScheme[] }`
- **Respuesta esperada**: `{ tenantId, items, schemes, updatedByUserId, updatedAt, people? }`
- **Estado**: IMPLEMENTADO
- **Notas**: Un solo carrito por local, no por persona. El SSE `cart_updated` avisa al equipo del comercio y al vendedor/dueño del distro vinculado. `/cart/items` queda por compatibilidad y la web ya no lo usa. Las percepciones/IIBB son **de ese comercio** (las confirma el carrito o las carga a mano): no hay alícuota global por proveedor. El catálogo (búsqueda y ficha) usa la misma alícuota: Elit y varios no la mandan en el producto, solo en la cotización. **Lista y esquema las suman; offline no.** Marcas y distribuidores no ven ni aplican ese impuesto. **Autor por línea**: cada ítem lleva `by: { [userId]: unidades }` (suma = `qty`; `"_"` = sin registrar, de antes del cambio). Lo resuelve el servidor al guardar (`cart-attribution.ts`): cada uno suma solo a su nombre; lo de otro integrante se puede bajar o mover, nunca agrandar. Una web sin `by` conserva el reparto que tenía la línea. `people` (`{ [userId]: username }`, también ex integrantes) va solo al comercio; el distribuidor recibe las líneas sin `by` ni `people`. La web arma el pedido por distribuidor con el filtro «Productos de» (todos / solo de / todos menos) y, al pedir, saca del carrito solo las unidades de esas personas.

### [FEATURE] Publicidad paga (espacios, campañas, stats)
- **Método**: GET | PUT | POST
- **Ruta**: `/admin/ads` · `/admin/ads/slots/:slotId` · `/my/ads` · `/my/ads/campaigns` · `/my/ads/campaigns/:id` · `/ads/creatives` · `/ads/campaigns/:id/track`
- **Auth**: Bearer. Admin: `ROLE_ADMIN`. Contratar: `OWNER`/`ADMIN` de `DISTRIBUTOR` o `BRAND` con `advertisingEnabled`. Creatives y track: usuario autenticado.
- **Body / Params**: slot `{ enabled?, monthlyPriceUsd?, maxConcurrent?, name?, description? }` · campaña `{ slotId, title, subtitle?, imageUrl?, linkUrl?, status: DRAFT|ACTIVE|PAUSED|ENDED }` · track `{ kind: impression|click, path? }`
- **Respuesta esperada**: overview `{ allowed, monthlyDue, slots, campaigns[] }` con `stats: { impressions, clicks }` · creatives `{ campaignId, slot, placement, title, subtitle, imageUrl, linkUrl, advertiser, provider }`
- **Estado**: IMPLEMENTADO
- **Notas**: El flag `advertisingEnabled` lo prende el superadmin (cuenta que paga). No lo cambia la org. Descubrimiento cerrado: un distro no vinculado solo aparece con campaña **ACTIVE** en el slot `discovery`. Cupo por espacio (`maxConcurrent`). UI: `/publicidad`, Admin → Publicidad.

### [FEATURE] Carrito recíproco con el portal del distribuidor (Invid, Elit, Air)
- **Método**: POST
- **Ruta**: `/providers/INVID/checkout/preview` · `/providers/ELIT/checkout/preview` · `/providers/AIR/checkout/preview` · `POST /providers/NEW_BYTES/checkout/cart` y `POST /providers/NEW_BYTES/checkout/preview`
- **Auth**: Bearer, organización comercio con cuenta Invid cargada
- **Body / Params**: igual que antes (`items`, `addressId`, `paymentOption`, `deliveryOption`) más `dropPortalCodes?: string[]` (códigos que el comercio decidió sacar del carrito del distribuidor). New Bytes lo acepta y lo ignora.
- **Respuesta esperada**: agrega `sync?: { removedInPortal: string[], addedInPortal: {code, qty, name?}[], qtyChangedInPortal: {code, qty, name?}[], summedInBoth: {code, qty, name?, baseQty?}[] }`. `addedInPortal` es lo que solo estaba en el distribuidor: sigue en ese carrito y NODO no lo agrega solo. `summedInBoth` es un producto que estaba en los dos con distinta cantidad; `qty` es la suma y `baseQty` la que tenía NODO. `items` es el carrito ya unificado (incluye lo pendiente del portal).
- **Estado**: IMPLEMENTADO
- **Notas**: No se reemplaza un carrito por el otro. La API guarda en `ProviderSyncConfig.portalCartSnapshot` la foto (`{codigo: cantidad}`) de lo ya unificado. Contra esa foto: borrado en el portal se saca de NODO, borrado en NODO se saca del portal, cantidad cambiada en el portal gana. Sin foto (primera vez, o después de confirmar), lo que está en los dos se suma una sola vez y lo que solo está en el portal queda pendiente. La foto de una suma guarda `baseQty` (la cantidad de NODO), no el total, para no volver a sumar. Lo pendiente no entra a la foto hasta que el comercio lo deje: si entrara, la pasada siguiente lo leería como borrado en NODO. `dropPortalCodes` lo saca del portal. La foto no avanza sobre cambios que el frontend todavía no reflejó. Confirmar el pedido arma solo lo que está en NODO; la UI no deja confirmar mientras haya líneas pendientes. **New Bytes** no concilia: en cada verificación, cotización y confirmación hace `PATCH carrito/empty` → `POST carrito/new` → `POST carrito/item` con las líneas de NODO (una por código, cantidades sumadas). Lo que estaba solo en el portal no se suma, no queda pendiente y no frena el pedido; la respuesta no trae `sync`. Para que el comercio elija qué traer, `GET /providers/NEW_BYTES/checkout/portal-cart` devuelve `{ items: { code, qty, name? }[] }` tal cual está el carrito de la cuenta (`GET carrito`), sin modificarlo; el frontend lo lee antes de cotizar.

### [FEATURE] Detalle de pedidos Invid (productos, TC, impuestos)
- **Método**: GET
- **Ruta**: `/providers/INVID/orders`
- **Auth**: Bearer, organización comercio con cuenta Invid cargada
- **Body / Params**: `refresh=1` opcional para saltear cache
- **Respuesta esperada**: `{ orders: InvidOrder[], currentExchangeRate?, paymentForm?, paymentUploads?, note? }`. Cada pedido incluye `items[]` (código, nombre, precio s/IVA, cantidad, total de línea), `totals?`, `exchangeRate?`, `exchangeRateSource`, `amountArs?`, `canAttachPayment?` y `paymentHref?`. `paymentForm` trae los bancos del HTML de Invid (Macro, Galicia, Mercado Pago; no el título «Banco: *»), observaciones y hasta 3 `fileFields`.
- **Estado**: IMPLEMENTADO
- **Notas**: El HTML del portal a veces pone el estado de línea (Abierto) en una columna: el parser identifica producto / precio / cantidad por contenido, no por posición. No se inventan alícuotas. Si Invid no discrimina IVA/IIBB, `taxes` es el resto entre el neto de las líneas y el total. El TC del HTML del pedido manda; si no viene, se usa la cotización actual de Invid (`traerCotizacionOpcionPago`) y se etiqueta como actual, no histórica.

### [FEATURE] Comprobantes de pago Invid (banco, observaciones, archivos)
- **Método**: POST
- **Ruta**: `/providers/INVID/payments/attach`
- **Auth**: Bearer, organización comercio con cuenta Invid cargada
- **Body / Params**: `multipart/form-data` con `bank` (Macro/Galicia), `notes` (observaciones), `orderNumber`, `paymentHref?` y hasta 3 archivos (`archivo1`… o los `fileFields` del portal). Banco, observaciones y al menos un archivo son obligatorios.
- **Respuesta esperada**: `{ ok: true, status }`
- **Estado**: IMPLEMENTADO
- **Notas**: Replica el popup «Comprobantes de Pago» de Invid. El POST rellena los hidden del form scrapeado y manda los archivos a los mismos `name` del portal. Un informe después de las 17:00 lo toma Invid con el TC del día siguiente (aviso en la UI). Echeq = Galicia.

### [FEATURE] Informes de pago Elit (banco, tipo, fecha, importe, un archivo)
- **Método**: GET | POST
- **Ruta**: `/providers/ELIT/payments/options` · `POST /providers/ELIT/payments/operation` · `POST /providers/ELIT/payments/operation/:id/attach` · `POST /providers/ELIT/payments/finish`
- **Auth**: Bearer, organización comercio con cuenta Elit cargada
- **Body / Params**: options sin body. Operación `{ type, bank, bankName, operationName, date, amount, number }`. Attach `multipart/form-data` con un `file`. Finish `{}`.
- **Respuesta esperada**: options `{ banks[], operations[] }` (cada operación puede traer `validations: { date, amount, number }`). Create/attach/finish: payload de Elit (el create suele traer `id` de la operación).
- **Estado**: IMPLEMENTADO
- **Notas**: No es por pedido: es un informe de cuenta. La UI es un modal **Enviar** (crear + adjuntar + cerrar). **No** usar `GET /account/payments?include=options` — Elit crea un informe vacío. New Bytes, Air y Grupo Núcleo no tienen upload de comprobantes: solo ver/descargar (GN ni eso).

### [FEATURE] Cuenta corriente Elit (cupo, dólares, historial)
- **Método**: GET
- **Ruta**: `/providers/ELIT/account`
- **Auth**: Bearer, organización comercio con cuenta Elit cargada
- **Body / Params**: `refresh=1` opcional
- **Respuesta esperada**: además de `movements[]`, `summary` (`status`, `approved`, `creditLimit`, `currentAccount`, `checks`, `pendingOrders`, `availableCredit` en ARS), `usdVouchers[]` (comprobantes en USD: fecha, vencimiento, debe/haber, estado) y `balance` = saldo de cuenta corriente en **pesos**. Cada movimiento puede traer `remito`, `amount` (importe en la moneda del comprobante), `exchangeRate`, `dueDate`, `status`. `debit`/`credit` del historial van en ARS.
- **Estado**: IMPLEMENTADO
- **Notas**: Sale del RSC de `/mi-cuenta/cuenta-corriente`. No se inventa el cupo: si Elit no lo manda, la tarjeta queda en —. El saldo de cuenta corriente es el del JSON/resumen de Elit; si no viene, el running `balance` del comprobante **más reciente** (no el primero del payload). La UI replica cupo / cuenta corriente / cheques / pedidos pendientes / crédito disponible, la tabla de dólares y el historial con moneda y cotización. El filtro de mes usa la fecha (o vencimiento) del comprobante en calendario, sin corrimiento UTC.

### [FEATURE] Detalle de pedidos New Bytes (productos e importes)
- **Método**: GET
- **Ruta**: `/providers/NEW_BYTES/orders/:id`
- **Auth**: Bearer, organización comercio con cuenta New Bytes (user/password del portal)
- **Body / Params**: `id` = `albNumber` (Mis pedidos) u `orderNumber` (órdenes de compra). Query `kind=orders|purchase` para probar primero `miCuenta/pedidos/:id` o `miCuenta/ordenesDeCompra/:id`.
- **Respuesta esperada**: `{ found, orderNumber, albNumber, status, date, items[], notes?, payment?, delivery?, address?, trackingNumber?, invoice?, subtotalUsd?, iva?, perceptions?, perceptionLabel?, totalUsd?, totalArs?, exchangeRate? }`. `found: false` si New Bytes no tiene ese id. Los ítems usan los mismos campos del carrito (`productId`, `product.title`, `amount`, `price.value`, `subtotal`).
- **Estado**: IMPLEMENTADO
- **Notas**: El listado `GET /providers/NEW_BYTES/orders` suele ser solo encabezado. Ver más vuelve a consultar el detalle. No se inventan nombres ni alícuotas: si el portal no manda ítems, la UI lo dice. Ítems pueden traer `ivaPercent` / `iva` (desde `product.price.iva`) para discriminar IVA 10,5 vs 21 en la ficha.

### [FEATURE] Desglose fiscal en fichas de cuenta (sin imp. / IIBB / IVA 10,5 / IVA 21)
- **Método**: GET (campos extra en respuestas ya existentes)
- **Ruta**: `/providers/ELIT/account` · `/providers/ELIT/salenotes/:number` · `/providers/INVID/account` · `/providers/NEW_BYTES/orders/:id` · `/providers/*/drafts` · `/providers/AIR/account`
- **Auth**: Bearer, organización comercio con la cuenta del proveedor
- **Body / Params**: sin cambios
- **Respuesta esperada**: Elit NV: ítems con `net`, `vat`, `internalTax`, `perceptions`; `summary.net/vat/perceptions`. Invid pedidos: `totals.iva105` / `totals.iva21` cuando el HTML los discrimina. NB ítems: `ivaPercent`, `iva`. Drafts: `subtotal`, `impuestos`, `percepciones` y `addressSnapshot` con `vat` / `iva21` / `iva105` / `perceptions` / `internalTax` (no pisa el snapshot de dirección).
- **Estado**: IMPLEMENTADO
- **Notas**: La UI siempre muestra Total sin imp., IIBB/percepciones, IVA 10,5% e IVA 21% (0,00 si no hay dato). No inventa alícuota: si el IVA lump no calza 10,5 ni 21, va a "IVA (sin discriminar)". Ítems kit/esquema Elit (`ESFABRIC_*`, `alfaCode` ESFABRIC, nombre "PC ELIT", unitario 0) traen `kit`, `children` y `net` (el resto del total sin imp. de la nota si Elit mandó 0). Piezas del esquema que vienen con precio de lista (CPU/fuente qty 1) se anidan: se muestran P. unit. / IVA / Total de lista, **sin sumar** al total de la nota. La columna Total de cada línea padre es el neto (`cant × price` / `net` del kit), no el `total` de Elit (que suele ir con IVA). `vatPercent` es la alícuota (10,5 / 21); `vat` es el monto. Si la NV no trae alícuota, se completa con la del catálogo Elit de esa organización (`TenantProductOffer.ivaPercent`) por código / SKU / alfa. Si la suma de Totales padre no cierra con `summary.net`, la UI muestra un aviso de solo lectura.

### [FEATURE] SISTEMA TGS (AcuStock)
- **Método**: GET | PATCH | POST | PUT | DELETE
- **Ruta**: `/tgs/enabled` · `/tgs/keys` · `PUT /tgs/keys` · `DELETE /tgs/keys` · `/tgs/me` · `/tgs/clientes` · `POST /tgs/clientes` · `/tgs/clientes/:id` · `PATCH /tgs/clientes/:id` · `/tgs/stock` · `POST /tgs/stock` · `/tgs/stock/:id` · `PATCH /tgs/stock/:id` · `/tgs/ventas` · `POST /tgs/ventas` · `/tgs/productos-vendidos` · `/tgs/ventas/:id` · `PATCH /tgs/ventas/:id` · `/tgs/compras` · `POST /tgs/compras` · `/tgs/compras/:id` · `PATCH /tgs/compras/:id` · `/tgs/ctacte/clientes/:id` · `POST /tgs/ctacte/clientes/:id` · `/tgs/ctacte/proveedores/:id` · `POST /tgs/ctacte/proveedores/:id` · `/tgs/ordenes` · `POST /tgs/ordenes` · `/tgs/ordenes/:id` · `PATCH /tgs/ordenes/:id` · `/tgs/rma` · `POST /tgs/rma` · `/tgs/rma/:id` · `PATCH /tgs/rma/:id`
- **Auth**: Bearer, organización de la sesión. Solo el tenant de `testuser1` (o `TGS_ALLOWED_USERNAME` / `TGS_ALLOWED_TENANT_ID`). El resto recibe 403. `/tgs/enabled` responde `{ enabled }` sin pegarle a AcuStock.
- **Body / Params**: paginación `page`, `per_page` (máx. 100). Stock `q`, `sku`, `local_id`. Claves `{ apiKey, apiSecret, baseUrl? }` (el secret no se vuelve a devolver). Ventas `desde`, `hasta`, `estado`. Productos vendidos igual + `q`, `entrega` (estado de entrega del ítem), `sort` (`fecha|venta|cliente|producto|cantidad|precio|subtotal|estado|entrega`), `dir` (`asc|desc`). Órdenes/RMA `estado`, `cliente_id`, `q`. Escrituras reenvían a AcuStock **solo las claves del GET/alta documentadas** (no labels de la UI del sistema). Venta: `cliente_id`, `fecha_emision`, `tipo_documento`, `tipo_factura`, `local_id`, `estado`, `items[]` (`producto_id`, `descripcion`, `cantidad`, `precio_unitario`, `serie?`, `estado_entrega?`). Stock PATCH: `nombre`, `precio`, `stock` y el resto de campos de stock del GET si vienen. Alta RMA: `falla_reportada`, `producto_nombre?`, `producto_serie?`, `cliente_id?`, `venta_id?`, `venta_numero?`, `orden_trabajo_id?`.
- **Respuesta esperada**: listados `{ items, meta: { page, per_page, total, total_pages, local_id? } }`. Detalle = objeto AcuStock (`data` desempaquetado). Cta cte incluye `movimientos` y `meta`. `GET /tgs/productos-vendidos` → `{ items: TgsProductoVendido[], meta, ventas, truncated }` (una fila por ítem, no por comprobante). `GET /tgs/keys` → `{ configured, source: db|env|none, keyHint, secretConfigured, baseUrl }`.
- **Estado**: IMPLEMENTADO
- **Notas**: Proxy HTTP a `https://thegamershop.acustock.app/api/v1/sistema`. Claves: UI `/sistema-tgs/claves` (cifradas en DB) o fallback `ACUSTOCK_API_KEY` / `ACUSTOCK_API_SECRET`. El frontend nunca ve el secret. Un 401 de AcuStock se traduce a 502 para no cerrar la sesión de Nodo. La clave de AcuStock es **lectura y escritura** (`read_write`) en todos los módulos; Nodo reenvía POST/PATCH. UI: `/sistema-tgs`. GET stock por id numérico no existe en AcuStock (404); el detalle usa SKU. `GET /tgs/productos-vendidos` aplana `GET /ventas/:id`. El estado de la columna Productos vendidos es la **entrega del ítem** (`estado_entrega` / `entrega` / `item.estado` si el valor es de entrega / `entregado` boolean), no el cobro de la factura (`venta.estado`). Si AcuStock no manda el campo, `estado_entrega` queda `null` — la UI no inventa "Pendiente". Si AcuStock manda etiquetas o proveedor en la línea, se muestran. Tope 250 ventas por consulta. UI `/sistema-tgs/reposicion`: cola de pendientes + sugerencias reusando `GET /search/provider/:p` (sin endpoint nuevo); el armado se exporta al carrito de Nodo.

### [FEATURE] Noticias (feed, CRUD, pública, hero)
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: `GET /news` · `GET /news/hero` · `GET /news/:id` · `GET /my/news` · `POST /my/news` · `PUT /my/news/:id` · `DELETE /my/news/:id` · `GET /public/news/:publicKey` · `POST /news/:id/track` · `GET /admin/news` · `DELETE /admin/news/:id`
- **Auth**: Bearer, organización. Pública: sin auth. Publicar: `OWNER`/`ADMIN`/`PRODUCT_MANAGER` de `DISTRIBUTOR`, o `OWNER`/`ADMIN`/`MARKETING` de `BRAND`. Hero: comercio. Moderación: `ROLE_ADMIN` lista y borra cualquier nota.
- **Body / Params**: `{ title, excerpt, bodyHtml, coverUrl, kind, public, publishedAt?, expiresAt?, attachments[], relatedSkus[], imageUrls[] }` · feed `kind`, `authorType`, `q`, `cursor` · track `{ kind: view | attachment_click }`
- **Respuesta esperada**: feed `{ items: NewsCard[], nextCursor? }` · hero `{ slides[] }` · ficha `{ article, author: { name, type, logoUrl, linked, advertised }, attachments[], canDownloadCommercial, stats? }` · pública sin adjuntos `IN_APP`
- **Estado**: IMPLEMENTADO
- **Notas**: Plan: `docs/PLAN_NOTICIAS.md`. Módulo fijo `news`. 404 si no es audiencia. Distro no ve notas de otro distro; marca no ve notas de otra marca. El comercio ve vinculados ∪ anunciantes (cualquier campaña ACTIVE). El hero usa el slot `news_hero`. `canDownloadCommercial` solo con `TenantLink`. Cuerpo HTML sanitizado (`sanitizeBrandHtml`). UI: `/noticias`, `/n/:publicKey`. Admin: `/admin?tab=news`. Aislamiento: `scripts/check-news-visibility.mjs`. Muestra: `scripts/seed-demo-news.mjs`.
### [FEATURE] Proveedores por lista (distribuidores / marcas sin API) — alta
- **Método**: POST
- **Ruta**: `/providers` · `/providers/enable-own-list`
- **Auth**: Bearer. `/providers`: superadmin o comercio (tipo 1). `/providers/enable-own-list`: organización distribuidor o marca.
- **Body / Params**: `/providers`: `{ name, type: "DISTRIBUTOR"|"BRAND", listUpdateDays?, contactEmail?, contactPhone?, notes?, config? }` (`config` = mismos campos que `PUT /providers/:provider/config`, solo para el comercio que lo crea). `/providers/enable-own-list`: `{ listUpdateDays? }`.
- **Respuesta esperada**: `{ id, name, type, providerKey, listUpdateDays }`. `providerKey` es `LIST_<SLUG>` generado a partir del nombre (único, inmutable).
- **Estado**: IMPLEMENTADO
- **Notas**: Un proveedor por lista es un `Tenant` DISTRIBUTOR/BRAND con `providerKey` `LIST_*`; usa toda la configuración de proveedor existente (markup, faltantes, stock cero, offline/esquema, logo/color). Si lo crea un comercio queda vinculado automáticamente y marcado `managedByPlatform`. El tipo `Provider` ya no es una unión cerrada: los 14 con adapter están en `ALL_PROVIDERS`; una clave válida cumple `isProviderKey`. La búsqueda, el carrito y las fichas funcionan igual: las ofertas del proveedor se materializan como `TenantProductOffer` (`source` BASE_LIST) en cada comercio vinculado, y el descuento del vínculo se aplica al leer solo sobre esas.

### [FEATURE] Proveedores por lista — subir y gestionar planillas
- **Método**: POST | GET
- **Ruta**: `POST /providers/:key/imports` (multipart, campo `file`, .xlsx/.xls/.csv, máx. 20 MB) · `GET /providers/:key/imports` · `GET /providers/:key/imports/:id` · `POST /providers/:key/imports/:id/apply` · `POST /providers/:key/imports/:id/discard` · `POST /providers/:key/imports/:id/revert`
- **Auth**: Bearer. Nivel según quién sube: superadmin o la organización dueña del `providerKey` (OWNER/ADMIN/PRODUCT_MANAGER) → `level: BASE` (precio base para todos los vinculados); comercio vinculado (OWNER/ADMIN/PRODUCT_MANAGER) → `level: TENANT` (sus precios, solo él). Un proveedor con API responde 400.
- **Body / Params**: —
- **Respuesta esperada**: `ListImportRecord` `{ id, provider, level, status: PROCESSING|NEEDS_REVIEW|APPLIED|DISCARDED|REVERTED|FAILED, tenantId, tenantName, originalFileName, profileId, rowsTotal, rowsData, summary: { created, priceChanged, unchanged, missing, withoutPrice, issues, normalized, profileMatch }, error, createdAt, appliedAt, revertedAt }`. El detalle agrega `diff: { counts, samples: { created[], priceChanged[] (before/after/percent), missing[] }, missingIds[] }`, `reviewReasons[]`, `preview` (encabezados, primeras 30 filas, hojas) e `issues[]` (fila, columna, motivo).
- **Estado**: IMPLEMENTADO
- **Notas**: La subida responde enseguida en `PROCESSING` y el procesamiento corre en background (la UI consulta el detalle cada pocos segundos). Pipeline: lectura cruda (celdas unificadas), análisis estructural (encabezado real debajo de logos, divisores por marca/categoría, pie de página, encabezados repetidos), perfil de lectura por huella del archivo, normalización con issues por fila, diff contra la última carga aplicada del mismo nivel y chequeos de sanidad (faltantes > 30 %, cambios > 80 %, todos con el mismo %, > 5 % sin precio, filas < mitad, perfil parcial o propuesto). Si todo cierra se aplica sola; si no, queda `NEEDS_REVIEW` y notifica (`OrgNotification` SYSTEM, `landingKey` `list-import:<id>`). `apply` fuerza una carga en revisión y aprueba su perfil propuesto. `revert` solo sobre la última aplicada del nivel; restaura el snapshot. Una lista propia (TENANT) de un comercio no pisa ni oculta lo que viene de la base y viceversa (acción de faltantes acotada por `source`). Si solo hay lista de un comercio, los demás vinculados ven la ficha sin precio. Un cron marca `FAILED` lo que quedó `PROCESSING` más de 30 min.

### [FEATURE] Proveedores por lista — perfil de lectura
- **Método**: GET | PUT | POST
- **Ruta**: `GET /providers/:key/import-profile` · `PUT /providers/:key/import-profile` · `POST /providers/:key/import-profile/suggest?sheet=`
- **Auth**: Bearer, mismos permisos que subir.
- **Body / Params**: PUT: `{ sheetIndex?, columnMap: { "<encabezado>": "<campo>"|null }, currency?, priceIncludesIva?, ivaPercent?, numberFormat: DOT|COMMA, dividerMeaning: BRAND|CATEGORY|IGNORE, reprocessImportId? }`. Campos válidos = los de `NormalizedProduct` (externalId, name, price, finalPrice, brand, category, stock…). Obligatorio `name` y `price` o `finalPrice`.
- **Respuesta esperada**: GET: `{ fields[], active, proposed, latestImport: { id, status, preview, originalFileName, createdAt } }`. PUT: el perfil creado (versión nueva, ACTIVE; los anteriores quedan ARCHIVED). suggest: `{ spec, fromAi, reasoning, headers[] }` sin guardar.
- **Estado**: IMPLEMENTADO
- **Notas**: La IA (OpenAI, clave guardada en base como en el enriquecimiento de catálogo) se consulta una sola vez por formato nuevo con encabezado + 25 filas de muestra; sin clave o si falla, mapeo heurístico por nombres de columna. Un perfil propuesto siempre pasa por revisión antes de usarse solo. Con `reprocessImportId` la carga en revisión se vuelve a procesar con el perfil nuevo.

### [FEATURE] Proveedores por lista — frescura
- **Método**: GET
- **Ruta**: `/providers/:key/freshness`
- **Auth**: Bearer, organización vinculada, dueña o superadmin.
- **Body / Params**: —
- **Respuesta esperada**: `{ provider, listUpdateDays, lastImportAt, lastImportLevel, expectedAt, status: NONE|NO_CADENCE|OK|DUE_SOON|OVERDUE }`.
- **Estado**: IMPLEMENTADO
- **Notas**: `listUpdateDays` es del proveedor (`Tenant.listUpdateDays`, se define al crearlo; editable por superadmin en `PUT /admin/tenants/:id`). `DUE_SOON` = faltan 2 días o menos. La UI muestra el semáforo en la ficha del proveedor y, en el buscador, la leyenda "Lista vencida, se sugiere actualizar" debajo de la fecha de actualización del producto para quien puede subir listas. Un cron diario (09:00 AR, no corre de 23 a 6) crea una `OrgNotification` al proveedor y a los últimos que subieron cuando la lista vence (`landingKey` `list-overdue:<key>`), sin repetir en 24 h.

### [ELIMINADO] `POST /providers/:provider/import`
- Reemplazado por `POST /providers/:key/imports` (proveedores por lista). Los proveedores con API siguen sincronizando por adapter.


### [FEATURE] Canal de precios por comercio y proveedor (API o Lista)
- **Método**: GET | PUT (campos nuevos en endpoints existentes)
- **Ruta**: `/providers/:provider/config` · `/my/providers` (`purchase`)
- **Auth**: Bearer, organización vinculada.
- **Body / Params**: `PUT /providers/:provider/config` acepta `priceChannel: "API" | "LIST"`, `manualIibbPercent` (0..100 | null) y `manualPerceptionsPercent` (0..100 | null).
- **Respuesta esperada**: `ProviderConfig` con esos tres campos. `VisibleProvider.purchase` trae además `priceChannel`, `manualIibbPercent`, `manualPerceptionsPercent`; `VisibleProvider.selfConnected` indica un vínculo `LIST_CONNECTED` (sin vendedor ni chat: `accountManager` y `linkId` vienen en `null`).
- **Estado**: IMPLEMENTADO
- **Notas**: Un proveedor **cotiza por lista** para un comercio cuando es `LIST_*`, cuando no tiene adapter de catálogo (Ashir, HDC, Gaming City: el canal por defecto es `LIST` y la ficha abre en Listas) o cuando el comercio eligió canal `LIST`. El Excel de un proveedor sin adapter es de ese local (`TENANT`): no hay lista base que copie precios a otros comercios. Con canal `LIST` el cron no sincroniza ese proveedor y cualquier proveedor (también los que tienen API) admite `POST /providers/:key/imports` a nivel `TENANT`. `providerHasIvaRate(provider, canal)` (shared) es verdadero para los que cotizan por lista: el IVA sale de la fila o del perfil de la planilla (si no hay dato, 21 %), así que offline y esquema se pueden configurar. IIBB y otras percepciones no vienen en la lista: el comercio las carga como % sobre el neto y la UI las suma en lista y esquema (offline sin percepciones).

### [FEATURE] Conexión por lista y directorio de proveedores
- **Método**: GET | POST
- **Ruta**: `GET /my/suppliers/search?q=&type=DISTRIBUTOR|BRAND` · `POST /my/suppliers/:tenantId/connect-by-list`
- **Auth**: Bearer, organización comercio (tipo 1).
- **Body / Params**: `q` (nombre, contiene, sin distinguir mayúsculas), `type` opcional.
- **Respuesta esperada**: search: `[{ id, name, type, providerKey, hasApi, managedByPlatform, linkStatus }]`. connect-by-list: `{ linkId, status, provider, tenantName, tenantType }`.
- **Estado**: IMPLEMENTADO
- **Notas**: Antes de crear un proveedor por lista, la UI busca en este directorio para no duplicar a uno existente. Conectarse por lista no pide permiso al proveedor (el comercio usa sus propios datos): crea el vínculo en estado `LIST_CONNECTED` y deja el canal en `LIST`. Si el proveedor no tenía `providerKey`, se le genera uno `LIST_*`. El comercio ve el catálogo con sus precios pero sin vendedor ni chat; cuando el distribuidor le asigna vendedor desde Clientes (`PUT /my/clients/:linkId` con `accountManagerId`), el vínculo pasa solo a `ACTIVE`. `POST /providers` (creado por un comercio) también deja el vínculo en `LIST_CONNECTED`. `TenantLinkStatus` suma `LIST_CONNECTED` ("Conectado por lista").

### [FEATURE] Pedido por mensaje para proveedores que cotizan por lista
- **Método**: POST (cambio de reglas en endpoint existente)
- **Ruta**: `/orders/offline`
- **Auth**: Bearer, comercio con permiso de pedir.
- **Body / Params**: cada ítem acepta `pricingMode: "list" | "scheme" | "offline"` (default `offline`).
- **Respuesta esperada**: sin cambios (`TenantOrder[]`, `channel: "OFFLINE"`).
- **Estado**: IMPLEMENTADO
- **Notas**: Para un proveedor que cotiza por lista es la única modalidad de compra: el carrito registra el pedido en Nodo con el modo de precio de cada línea y copia el mensaje para el vendedor ("Confirmar y copiar mensaje"). Reglas: ítems `offline` requieren `acceptsOffline`; `scheme` requiere `acceptsScheme`; `list` solo se acepta si el proveedor cotiza por lista (los que se compran por portal siguen con su checkout). Historial: `/pedidos` (filtro Offline) y pestaña Pedidos en la ficha del proveedor (`/proveedores/:key?tab=orders`).

### [FEATURE] Unificar proveedores por lista duplicados (superadmin)
- **Método**: GET | POST
- **Ruta**: `GET /admin/providers/merge-candidates` · `POST /admin/providers/merge`
- **Auth**: Bearer, `ROLE_ADMIN`.
- **Body / Params**: `{ from: "LIST_*", into: "<clave destino>" }`.
- **Respuesta esperada**: candidates: `[{ id, name, type, providerKey, managedByPlatform, clients, similar: [{ id, name, providerKey, type }] }]`. merge: `{ from, into, moved: { <tabla>: n }, dropped: { <tabla>: n }, deletedTenantId }`.
- **Estado**: IMPLEMENTADO
- **Notas**: Mueve fichas, ofertas, base, historial de precios, perfiles, cargas, corridas de sync, carrito, pedidos, señales de marca, imágenes, overrides/alias de catálogo, display y vínculos del duplicado al destino; lo que ya existía en el destino se descarta (el destino manda). La organización duplicada se borra si no tiene miembros; si los tiene, queda inactiva y sin clave. UI: Admin → Directorio → "Unificar proveedores por lista".


### [FEATURE] Marcas faltantes (superadmin)
- **Método**: GET | POST
- **Ruta**: `GET /admin/catalog-enrichment/brand-suggestions?provider=&ai=1` · `POST /admin/catalog-enrichment/brand-suggestions/apply`
- **Auth**: Bearer, `ROLE_ADMIN`.
- **Body / Params**: GET: `provider` opcional, `ai=1` valida las candidatas con OpenAI (una llamada por proveedor). POST: `{ provider, brand, externalIds?: string[], source?: MANUAL|AUTO|AI }` — sin `externalIds` se asigna a todos los productos sin marca del proveedor que tengan la palabra en el nombre, tags o categoría.
- **Respuesta esperada**: GET: `{ totalMissing, providers: [{ provider, missingCount, usedAi, suggestions: [{ brand, normalized, count, score (0..1), known, aiConfirmed: true|false|null, externalIds[], sampleNames[] }] }] }`. POST: `{ brand, termId, updated }`.
- **Estado**: IMPLEMENTADO
- **Notas**: Productos "sin marca" = `brand` cruda vacía y sin override `displayBrand`. La detección es determinística: palabras repetidas en los nombres (y tags / categoría / subcategoría) de cada proveedor, descartando palabras del rubro (gabinete, fuente, garantía…), códigos de modelo (TM50, SX550-TS) y puntuando posición en el nombre, forma de nombre propio y coincidencia con marcas ya conocidas (términos y alias BRAND). Al aplicar se hace `ensureTerm(BRAND)` (si la marca es nueva se crea el término y su organización de marca), se escribe el override `displayBrand` y se completa la `brand` cruda vacía para que conteos y filtros la vean. UI: Admin → Catálogo → "Marcas faltantes", con "Validar con IA" y "Asignar las seguras" (confirmadas por IA, conocidas o confianza ≥ 70 %).

### [FEATURE] Imágenes: pendientes para todos los proveedores
- **Método**: GET (cambio de regla en endpoints existentes)
- **Ruta**: `/admin/images/status` · `/admin/images/missing` · `POST /admin/images/first-photo`
- **Auth**: Bearer, `ROLE_ADMIN`.
- **Body / Params**: sin cambios.
- **Respuesta esperada**: sin cambios.
- **Estado**: IMPLEMENTADO
- **Notas**: "Pendiente visible" ahora es oferta activa con stock > 0 **o stock desconocido** (las listas de precios no siempre lo traen y el catálogo igual muestra esos productos). Antes, todo producto sin stock informado caía en "sin stock / diferidos" y parecía que solo Air tenía pendientes. El selector de distribuidor de la pantalla sale de `status.byProvider` (todos los que tienen productos, incluidos `LIST_*`), no de la lista fija de 14.


### [FEATURE] Planes y suscripciones de comercios (Tipo 1)
- **Método**: GET | POST | PUT | DELETE
- **Ruta**: comercio `/my/subscription` · `/my/subscription/upgrade` · `/my/subscription/request` · `/my/subscription/payment-notice` · `PUT /my/providers/:provider/search` · superadmin `/admin/subscriptions` · `/admin/subscriptions/:tenantId` · `…/:tenantId/plan` (PUT) · `…/payments` (POST) · `…/billing-date` (PUT) · `…/extend` (POST) · `…/courtesy` (PUT, DELETE) · `…/suspend` · `…/reactivate` · `…/cancel` (POST) · `…/notes` (PUT) · `…/setup-fee` (PUT)
- **Auth**: `/my/subscription*`: Bearer de un comercio (`RETAILER`); ver cualquier miembro, `upgrade`/`request`/`payment-notice` solo `OWNER`/`ADMIN` (`canManage`). Abiertas aunque la suscripción esté suspendida. `PUT /my/providers/:provider/search`: `RETAILER` con `providers.manage`. `/admin/subscriptions*`: `ROLE_ADMIN`.
- **Body / Params**: upgrade `{}` · request `{ plan, message? }` · payment-notice `{ reference?, message? }` · search `{ enabled: boolean }` · admin list `?filter=all|active|upcoming|past_due|grace|suspended|courtesy|cancelled&q=` · plan `{ plan, price?: number|null, reason? }` · payments `{ kind?: SUBSCRIPTION|SETUP_FEE, amount?, paidAt?, months? (1–24), periodStart?, periodEnd?, provider?: MANUAL|TRANSFER|COURTESY|MERCADOPAGO|STRIPE|OTHER, externalReference?, notes? }` · billing-date `{ nextBillingAt }` · extend `{ days (1–365), reason? }` · courtesy PUT `{ plan?, until?: string|null, reason? }` · courtesy DELETE `{ mode: CONVERT|CANCEL, nextBillingAt? }` · suspend/cancel `{ reason? }` · reactivate `{ nextBillingAt? }` · notes `{ notes: string|null }` · setup-fee `{ status?: PENDING|PAID|WAIVED|NOT_APPLICABLE, amount?: number|null, blocksCustom? }`
- **Respuesta esperada**: `GET /my/subscription` → `{ tenantId, tenantName, plan, planLabel, price, listPrice, priceOverridden, currency, status, statusLabel, access: FULL|RESTRICTED, startedAt, currentPeriodStart, currentPeriodEnd, nextBillingAt, dueAt, suspendsAt, daysUntilDue, daysOverdue, trialEndsAt, cancelledAt, setupFee: { amount, status, statusLabel, paidAt, blocksCustom }, capabilities: { maxSearchProviders: number|null, directCheckout, providerPortalAccess, providerAccountAccess, integratedChat, advancedAnalytics, externalIntegrations, customModules, customBranding }, usage: { connectedProviders, activeSearchProviders, maxSearchProviders }, canManage, payments[] }` · upgrade `{ applied, requested, subscription }` · search → `{ connectedProviders, activeSearchProviders, maxSearchProviders, provider, inSearch }` · admin list `{ counts: Record<filtro, number>, rows: AdminSubscriptionRow[] }` (vista + `storedStatus, courtesy { active, until, reason }, suspensionReason, cancellationReason, notes, gracePeriodEnd, lastPayment, pendingRequest, paymentNoticeAt, tenantActive, createdAt`) · detalle y acciones → fila + `usage, payments[], events[], reminders[]`
- **Estado**: IMPLEMENTADO
- **Notas**: El plan es del tenant. Precios: Base USD 45, Pro USD 60, Custom USD 150 + USD 300 de puesta en marcha. El estado efectivo se calcula por fechas en cada request (`PAST_DUE` → `GRACE_PERIOD` → `SUSPENDED` a los 7 días del vencimiento). La cortesía se le muestra al comercio como `ACTIVE`. Registrar un pago deja `ACTIVE` al instante. Superadmin en su propia sesión recibe `access=FULL` y capacidades completas; suplantando, ve lo del comercio. Errores de plan en el envelope: 403 `PLAN_FEATURE_UNAVAILABLE` (`details.capability`, `details.requiredPlan`), 409 `PLAN_SEARCH_LIMIT` (`details.maxSearchProviders`, `details.activeSearchProviders`), 403 `SUBSCRIPTION_SUSPENDED`. Rutas con capacidad: `providers/:p/checkout/*` y aprobación online (`directCheckout`); pedidos del portal, cuenta corriente, perfil, documentos, pagos y notas de venta (`providerAccountAccess`); percepciones y formas de pago observadas (`providerPortalAccess`); `/chat/*` salvo `unread`, que devuelve 0 (`integratedChat`); `/orders/insights*` (`advancedAnalytics`). El pedido offline (Generar pedido) está en todos los planes. Ver `docs/PLAN_SUSCRIPCIONES.md`.

## Pendiente (futuro)

## Pendiente (futuro)

### [FEATURE] Upload de imágenes (assets)
- **Método**: POST
- **Ruta**: `/assets/upload`
- **Auth**: Bearer token requerido (cualquier usuario autenticado)
- **Body / Params**: `multipart/form-data` con campo `file` (imagen JPEG, PNG, WebP, GIF o SVG, máx. 5 MB)
- **Respuesta esperada**: `{ url: "/assets/<uuid>" }`
- **Estado**: IMPLEMENTADO
- **Notas**: Los bytes se guardan en Postgres (`StoredAsset`) y se sirven en `GET /assets/<uuid>` (público, sin auth). Así viajan con la DB entre máquinas/deploys. Banners y logos aceptan URL externa, path `/assets/...` o legacy `/uploads/...` (disco local; se mantiene por compatibilidad).


## New Tree — portal newtree.com.ar (catálogo, checkout, cuenta)

Integración por emulación del portal (GlobalBluePoint / ASP.NET PageMethods). Diseño:
`docs/superpowers/specs/2026-09-05-new-tree-portal-integration-design.md`.
Credenciales (`POST /credentials`): `api_username`, `api_password`, `company`, `webservice`,
`client_id` (API SOAP de GlobalBluePoint: catálogo con precios del cliente, es lo que
Railway puede alcanzar) y/o `username` + `password` del portal (pedidos y cuenta
corriente; el portal bloquea IPs de datacenter salvo `NEW_TREE_PROXY_URL`). Sin nada, el
catálogo sincroniza por portal con precios de lista.

### `GET /providers/NEW_TREE/account`

Query: `refresh=1` (salta el cache de 5 min), `from` / `to` en `yyyymmdd` (por
defecto últimos 24 meses).

```json
{
  "profile": { "id": "12345", "salesTermsId": "3", "priceListId": "7" },
  "range": { "from": "20240905", "to": "20260905" },
  "balance": { "currency": "USD", "total": 10000, "overdue": 10000, "toExpire": 0 },
  "movements": [
    { "date": "2026-04-27", "form": "Fc A", "number": "00011-00095294", "voucher": "Fc A 00011-00095294",
      "dueDate": "2026-04-27", "currency": "ARS", "debit": 549913.98, "credit": null, "documentToken": "RWpAeg…" }
  ],
  "invoices": [ "…solo Fc / NC / ND de movements…" ],
  "orders": [ { "id": "1234", "date": "2026-05-01", "status": "Pendiente", "origin": "Web", "currency": "USD", "amount": 120.5, "detailUrl": "/PEDIDO/…" } ],
  "drafts": [ "…ProviderOrder de Nodo (mapProviderDraft)…" ],
  "note": "…"
}
```

### `GET /providers/NEW_TREE/documents?token=<documentToken>&name=<archivo>`

Descarga el PDF del comprobante (`wfmPrintMyDocument.aspx?<token>`) con la sesión
del portal. `token` es el `documentToken` del movimiento; nada más entra a la URL.

### `POST /providers/NEW_TREE/checkout/preview`

Body: `{ items: [{ code, qty, name? }], deliveryAddress?, notes? }`. `code` es el
`externalId` (ITEM_ID del portal). Vacía el carrito del portal, agrega cada ítem y
calcula.

```json
{
  "items": [ { "code": "20227", "qty": 2, "name": "Fuente XPG Probe 700W", "price": 48.87, "finalPrice": 54, "subtotal": 97.74, "error": null } ],
  "itemCount": 2, "subtotal": 97.74, "vat": 10.26, "interest": 0, "discount": 0, "perceptions": 0,
  "total": 108, "currency": "USD", "deliveryAddress": null, "stockOk": true, "note": "…"
}
```

`items[].error` trae el motivo cuando el portal rechaza un ítem (`stockOk: false`).

### `POST /providers/NEW_TREE/checkout/draft`

Mismo body más `background?: boolean`. Con `background` responde `PENDING` y el
pedido se crea en segundo plano (`GET /providers/NEW_TREE/drafts/:id` para seguirlo).
Crea el pedido real con `wsNRW_SaveSaleOrder`; el pago y la entrega los coordina el
vendedor de New Tree. Respuesta: `{ id, status, orderNumber, webOrderNumber,
paymentLabel, deliveryLabel, items, total, message }`. Pasa por el flujo de
aprobación (`PENDING_APPROVAL`) cuando el comercio lo exige.

### `GET /providers/NEW_TREE/drafts` · `GET /providers/NEW_TREE/drafts/:id`

Historial de pedidos creados desde Nodo (mismo formato que Elit).


## Solution Box — API interna de solutionbox.com.ar (catálogo, checkout, pedidos)

Emula la API JSON de la tienda (login con mail y contraseña del sitio). Diseño y
tabla de llamadas: `docs/superpowers/specs/2026-09-05-solution-box-site-api-design.md`.
Credenciales: `email` + `password`.

- `GET /providers/SOLUTION_BOX/account?refresh=1` → `{ profile:{id,name,email,cuit,exchange,paymentCondition,deliveryType}, orders:[{number,extension,date,seller,paymentCondition,amount,currency,exchange,invoice,status,items:[{code,qty,price,currency}]}], invoices:[…solo con factura…], drafts:[…], note }`.
- `GET /providers/SOLUTION_BOX/orders/:number/:ext` → un pedido; `…/invoice` → PDF de la factura.
- `POST /providers/SOLUTION_BOX/checkout/preview` body `{ items:[{code,qty,name?}], paymentCondition?, deliveryType? }` → `{ items, paymentConditions, paymentCondition, paymentLabel, deliveryTypes, deliveryType, deliveryLabel, deliveryAddress, subtotal, vat, internalTax, perceptions, perceptionLines, shippingCost, total, totalArs, exchange, currency:"USD", stockOk, note }` (totales de la proforma del sitio; `perceptionLines` trae la percepción de IIBB).
- `POST /providers/SOLUTION_BOX/checkout/draft` mismo body + `background?` → crea el pedido real (`{ id, status, orderNumber, … }`), con aprobación previa si el comercio la exige.
- `GET /providers/SOLUTION_BOX/drafts[/:id]` historial desde Nodo.


## Distecna — API pública (catálogo V1 + pedidos V2)

Homologación oficial v3.1. El catálogo se replica en Nodo (Distecna no está pensada
como DB en vivo). Credenciales (`POST /credentials`): `api_key` (Camino A, header
`x-apikey`) para sync de precios/stock, y/o `user` + `password` (Camino B, JWT 1 h)
para pedidos, condición de pago y direcciones. `environment` opcional: `prod` (default)
o `qa`. El listado no trae nombre ni fotos: el sync pide `GET /Product/{code}`
en la misma tanda (4 en paralelo, vía `/api/distecna-fetch`) y guarda nombre,
marca, categoría y foto junto con código/SKU/precio/stock/IVA. La ficha a veces
trae precio 0: no pisa la oferta del listado.

El certificado TLS de Distecna viene con cadena incompleta: el cliente habla HTTPS
con verify relajado e IPv4. **Railway no llega a :8096** (timeout). En producción el
API pide el catálogo vía el front `GET/POST /api/distecna-fetch?url=` (allowlist de
hosts Distecna). En local sigue el camino directo.
El sync usa Camino A (`x-apikey` + `GET /Product`) si hay API Key.

### `GET /providers/DISTECNA/account?refresh=1`

```json
{
  "paymentTerm": { "id": "…", "code": "DEP", "name": "(AR-DEP) 00 Deposito …" },
  "addresses": [{ "id": "…", "name": "Irala 1950 2 - Capital Federal (1837) - Argentina", "street": "Irala", "number": "1950", "floor": "2", "postalCode": "1837", "jurisdiction": "Capital Federal", "country": "Argentina" }],
  "drafts": ["…ProviderOrder de Nodo…"],
  "note": "…"
}
```

La API de Distecna no publica historial ni cuenta corriente. Sin usuario/contraseña
de Camino B, `paymentTerm` y `addresses` vienen vacíos.

### `POST /providers/DISTECNA/checkout/preview`

Body: `{ items: [{ code, qty, name?, type? }], paymentTermId?, deliveryAddressId?, notes? }`.
`code` es el `externalId` (campo `code` de Distecna). Antes de cotizar refresca
precio/stock just-in-time (`GET /v2/Product/{code}/{type}`). Si el listado V1 no
trajo `type`, lo busca con `GET /v2/Product?search=`.

```json
{
  "items": [{ "code": "COM760249702", "type": "NWOTRO", "qty": 10, "name": "…", "price": 1.82, "currency": "USD", "stock": 104368, "ivaPercent": 10.5, "iiPercent": 0, "subtotal": 18.2, "vat": 1.911, "internals": 0, "priceChanged": false, "stockChanged": false, "error": null }],
  "paymentTerm": { "id": "…", "code": "DEP", "name": "…" },
  "addresses": ["…"],
  "paymentTermId": "…", "deliveryAddressId": "…",
  "subtotal": 18.2, "vat": 1.911, "internals": 0, "perceptions": 0, "perceptionLines": [],
  "total": 20.111, "currency": "USD", "stockOk": true, "hasChanges": false, "note": "…"
}
```

`items[].error` si falta stock, falta `type` o Distecna rechazó el código (`stockOk: false`).
`hasChanges` si el JIT difiere del catálogo cacheado.

### `POST /providers/DISTECNA/checkout/draft`

Mismo body + `background?`. Con `background` responde `PENDING` y el pedido se crea
en segundo plano (`GET /providers/DISTECNA/drafts/:id`). Crea el pedido real con
`POST /v2/Order` (`productCode`, `productType`, `quantity`; `paymentTermId` y
`deliveryAddressId` opcionales). Ese POST no se reintenta. Pasa por aprobación
(`PENDING_APPROVAL`) cuando el comercio lo exige.

### `GET /providers/DISTECNA/drafts` · `GET /providers/DISTECNA/drafts/:id`

Historial de pedidos creados desde Nodo (mismo formato que Elit / New Tree).

## Polytech — portal Gestión Resellers

Credenciales (`POST /credentials`): `username` + `password` del portal
`https://beta.gestionresellers.com.ar` (el login devuelve la API Key) o `api_key` directa.
Auth de todas las llamadas: HTTP Basic con la API Key y password vacío.
El sync pagina `POST /products/search` (50 por página, 1 request/s). El precio guardado es
el neto USD (`price_without_vat`); `finalPrice` incluye el IVA de `vat`. `externalId` es
`source_id`.

### `GET /providers/POLYTECH/account?refresh=1`

```json
{
  "profile": { "legalName": "…", "userName": "…", "email": "…", "phone": "", "showsVat": false },
  "addresses": [{ "id": "…", "address": "…", "phone": "…" }],
  "couriers": [{ "id": "1", "name": "…" }],
  "perceptions": [{ "id": "57", "description": "IIBB …", "percent": 3 }],
  "exchangeRate": 1535,
  "orders": [{ "id": "…", "bucket": "pending", "createdAt": "…", "total": 10.5, "currency": "USD" }],
  "drafts": ["…ProviderOrder de Nodo…"],
  "note": "…"
}
```

`orders[].bucket` es `pending`, `in_process` o `shipped`.

### `GET /providers/POLYTECH/orders/detail?stateId=` · `?salesOrderId=`

Pendientes usan `stateId`. En proceso y despachados usan `salesOrderId`.

```json
{ "items": [{ "sku": "…", "description": "…", "quantity": 1, "vat": "21", "total": 12.5, "currency": "USD" }] }
```

### `POST /providers/POLYTECH/checkout/preview`

Body: `{ items: [{ code, qty, name? }], shippingService?: "delivery"|"pickup", addressId?, courierId?, paymentMethod?: "mercadopago", notes? }`.
`code` es el `source_id`. Refresca precio y stock con una búsqueda por ese id.

```json
{
  "items": [{ "code": "20484", "qty": 1, "name": "…", "price": 47.47, "finalPrice": 52.45, "currency": "USD", "stock": 10, "ivaPercent": 10.5, "subtotal": 47.47, "vat": 4.984, "priceChanged": false, "stockChanged": false, "error": null }],
  "addresses": ["…"], "couriers": ["…"],
  "shippingService": "delivery", "addressId": "…", "courierId": "…", "paymentMethod": null,
  "subtotal": 47.47, "vat": 4.984, "perceptionsAmount": 1.424, "perceptionLines": [{ "label": "IIBB …", "amount": 1.424 }],
  "total": 53.878, "currency": "USD", "exchangeRate": 1535, "stockOk": true, "hasChanges": false, "note": "…"
}
```

`items[].error` si no hay precio o no alcanza el stock (`stockOk: false`). Con stock 0 y
`restocking_quantity` > 0 se puede pedir hasta 10, igual que el portal.

### `POST /providers/POLYTECH/checkout/draft`

Mismo body + `background?`. Con `background` responde `PENDING` y el pedido se crea en
segundo plano. Crea el pedido real con `POST /orders/create`. Ese POST no se reintenta.
Pasa por aprobación (`PENDING_APPROVAL`) cuando el comercio lo exige. Si `paymentMethod`
es `mercadopago`, la respuesta puede traer `mercadopagoUrl`.

### `GET /providers/POLYTECH/drafts` · `GET /providers/POLYTECH/drafts/:id`

Historial de pedidos creados desde Nodo.


## Solicitudes — contacto, distribuidores/marcas y bandeja del superadmin

Todo lo que alguien le pide o avisa a NODO queda en `InboxRequest` y además llega por
mail a `ADMIN_NOTIFY_EMAIL` (si no está, `santyarena01@gmail.com`). Se cargan solas al
registrarse alguien (sin mail), al crear un comercio, con `POST /my/subscription/request`
(pedido de plan) y con `POST /my/subscription/payment-notice` (aviso de pago).

### [FEATURE] Formulario de contacto de la landing
- **Método**: POST
- **Ruta**: /contact
- **Auth**: no requerido. Exige el header `x-turnstile-token` (Cloudflare Turnstile). Límite: 5 cada 10 minutos por IP.
- **Body / Params**: `{ kind?: "CONTACT"|"CUSTOM"|"SUPPLIER"|"BRAND"|"PAYMENT", name (2..80), email, phone?, company?, message (5..2000) }`
- **Respuesta esperada**: `{ "received": true }`
- **Estado**: IMPLEMENTADO
- **Notas**: `CUSTOM` entra como pedido de plan, `SUPPLIER`/`BRAND` como "Distribuidor o marca", `PAYMENT` como aviso de pago. 403 `HUMAN_CHECK_REQUIRED` sin token válido; 429 por límite.

### [FEATURE] "Soy distribuidor / marca" en el alta
- **Método**: POST
- **Ruta**: /my/join-request
- **Auth**: Bearer token requerido (usuario sin organización, desde /onboarding)
- **Body / Params**: `{ kind: "SUPPLIER"|"BRAND", company (2..120), phone?, website?, message? }`
- **Respuesta esperada**: `{ "received": true }`
- **Estado**: IMPLEMENTADO
- **Notas**: no crea organización. Nombre y mail salen de la cuenta.

### [FEATURE] Bandeja "Solicitudes" (Administración)
- **Método**: GET
- **Ruta**: /admin/inbox?status=NEW|HANDLED|ARCHIVED&type=SIGNUP|NEW_STORE|PAYMENT_NOTICE|PLAN_REQUEST|SUPPLIER_JOIN|CONTACT&page=1
- **Auth**: Bearer token requerido, ROLE_ADMIN
- **Respuesta esperada**:
```json
{
  "items": [{
    "id": "uuid", "createdAt": "…", "type": "PAYMENT_NOTICE", "status": "NEW",
    "title": "Tecno Sur avisa que pagó", "message": "…",
    "contactName": "…", "contactEmail": "…", "contactPhone": "…", "company": "…",
    "tenantId": "…", "tenantName": "Tecno Sur", "userId": "…",
    "data": { "Nº de operación": "123456" },
    "note": null, "handledAt": null, "emailedAt": "…"
  }],
  "total": 1, "page": 1, "pageSize": 50,
  "pending": 3, "pendingByType": { "SIGNUP": 0, "NEW_STORE": 1, "PAYMENT_NOTICE": 1, "PLAN_REQUEST": 1, "SUPPLIER_JOIN": 0, "CONTACT": 0 }
}
```
- **Estado**: IMPLEMENTADO
- **Notas**: `data` es clave → valor ya rotulado para mostrar tal cual.

### [FEATURE] Pendientes de la bandeja
- **Método**: GET
- **Ruta**: /admin/inbox/pending
- **Auth**: Bearer token requerido, ROLE_ADMIN
- **Respuesta esperada**: `{ "pending": 3 }`
- **Estado**: IMPLEMENTADO

### [FEATURE] Atender, archivar o reabrir una solicitud
- **Método**: PATCH
- **Ruta**: /admin/inbox/:id
- **Auth**: Bearer token requerido, ROLE_ADMIN
- **Body / Params**: `{ status?: "NEW"|"HANDLED"|"ARCHIVED", note?: string|null }`
- **Respuesta esperada**: la solicitud actualizada (mismo formato que `items[]`, sin `tenantName`).
- **Estado**: IMPLEMENTADO
- **Notas**: `HANDLED`/`ARCHIVED` guardan `handledAt` y quién; volver a `NEW` los limpia.

## Códigos de invitación al equipo (tipo 1)

### [EQUIPO] Listar / crear / revocar códigos
- **Método**: GET | POST | DELETE
- **Ruta**: /my/team/invite-codes · /my/team/invite-codes/:id
- **Auth**: Bearer token requerido; permiso `team.manage`; solo RETAILER
- **Body (POST)**: `{ role: TenantRole (no OWNER; ADMIN solo el dueño), maxUses?: number|null, expiresAt?: ISO|null }`
- **Respuesta esperada**: `{ id, code: "XXXX-XXXX", role, roleLabel, maxUses, usedCount, expiresAt, revoked, status: ACTIVE|EXPIRED|EXHAUSTED|REVOKED, createdAt }` (GET devuelve lista)
- **Estado**: IMPLEMENTADO

### [EQUIPO] Vista previa del código (registro)
- **Método**: GET
- **Ruta**: /team-invites/:code/preview
- **Auth**: no requerido (throttle 20/min)
- **Respuesta esperada**: `{ valid: true, organizationName, roleLabel }` o `{ valid: false }` (sin más datos)
- **Estado**: IMPLEMENTADO

### [EQUIPO] Entrar al equipo con un código
- **Método**: POST
- **Ruta**: /onboarding/join-team
- **Auth**: Bearer token requerido (usuario sin organización)
- **Body**: `{ code }`
- **Respuesta esperada**: `{ tenantId, tenantName, role, roleLabel, token, onboarding }`. 400 `TEAM_INVITE_INVALID` si venció, se agotó o fue revocado; 409 si ya pertenece a una organización.
- **Estado**: IMPLEMENTADO

### [EQUIPO] Pedir sumarse a un comercio (mail del dueño)
- **Método**: POST | GET | DELETE
- **Ruta**: /onboarding/join-request
- **Auth**: Bearer token requerido (usuario sin organización; no superadmin). POST con throttle 10/h.
- **Body (POST)**: `{ ownerEmail }`
- **Respuesta esperada**:
  - POST → `{ message, request: { id, ownerEmail, status, createdAt, decidedAt } }`. `message` es siempre el mismo ("Si el mail corresponde al dueño de un comercio, le llegó tu pedido…"), exista o no ese dueño: si no hay dueño el pedido se guarda igual sin comercio y nadie lo ve. 409 si ya tiene organización o ya tiene un pedido pendiente; 429 con más de 5 pedidos en 24 h; 400 mail inválido.
  - GET → `{ request: {…} | null, joined: { token, onboarding } | null }`. `request` es el último pedido de los últimos 30 días (sin datos del comercio). `joined` viene cuando ya lo aprobaron: sesión nueva dentro del comercio.
  - DELETE → `{ cancelled: number }` (cancela el pendiente propio)
- **Estado**: IMPLEMENTADO
- **Notas**: solo comercios (RETAILER) activos y no administrados por la plataforma; se busca una membresía OWNER activa cuyo usuario tenga ese mail (sin distinguir mayúsculas). Al dueño le llega mail + aviso en la campana (`landingKey: join-request:<id>`).

### [EQUIPO] Pedidos para sumarse (dueño / gestor del equipo)
- **Método**: GET | POST
- **Ruta**: /my/team/join-requests · /my/team/join-requests/:id/approve · /my/team/join-requests/:id/reject
- **Auth**: Bearer token requerido; permiso `team.manage`; solo RETAILER
- **Body (approve)**: `{ role: TenantRole (no OWNER; ADMIN solo el dueño) }`
- **Respuesta esperada**:
  - GET → `[{ id, user: { id, username, email }, createdAt }]` (pendientes; quien ya entró a otra organización se cancela solo)
  - approve → `{ id, status: "APPROVED", role, roleLabel, username }`. 409 si la persona ya se sumó a otra organización (el pedido queda cancelado); 404 si ya no está pendiente.
  - reject → `{ id, status: "REJECTED" }`
- **Estado**: IMPLEMENTADO
- **Notas**: aprobar crea o reactiva la membresía en una transacción con el candado `onboarding:<userId>` (el mismo que el canje de códigos). A quien pidió le llega un mail con el resultado.

### [AUTH] Completar la cuenta tras una contraseña regenerada
- **Contexto**: cuando el superadmin (`PUT /admin/users/:id/password`) o el dueño (`POST /my/team/:membershipId/password`) regeneran una contraseña, el usuario queda con `mustSetupAccount = true`. El login con esa contraseña responde `{ token, mustSetupAccount: true }` y, hasta completar, cualquier otro endpoint autenticado responde **403** `{ code: "ACCOUNT_SETUP_REQUIRED" }` (salvo `/auth/account-setup*` y `/auth/refresh`). La web lleva a `/completar-cuenta`.
- **Método / Ruta**: `GET /auth/account-setup` → `{ username, email, mustSetupAccount }`
- **Método / Ruta**: `POST /auth/account-setup/email` `{ email }` → `{ sent: true }` (manda código de 6 dígitos al mail; 409 si el mail lo usa otra cuenta; 400 `RESEND_COOLDOWN`)
- **Método / Ruta**: `POST /auth/account-setup/email/verify` `{ email, code }` → `{ verified: true, email }` (el código solo vale para el mail al que se mandó)
- **Método / Ruta**: `POST /auth/account-setup/password` `{ password }` → `{ token }` (400 si el mail no se confirmó antes; cierra las otras sesiones)
- **Método / Ruta**: `POST /auth/account-setup/google` `{ idToken }` → `{ token }` (la cuenta queda con el mail de Google y sin contraseña; 409 si ese Google o ese mail son de otra cuenta)
- **Auth**: Bearer token requerido (el de la contraseña temporal)
- **Estado**: IMPLEMENTADO
- **Notas**: `GET /admin/users`, el árbol de organizaciones y `GET /my/team` exponen `mustSetupAccount` para mostrar "Pendiente de completar cuenta".
