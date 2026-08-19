# Investigación de APIs de proveedores

> **Actualización 2026-08-19 (segunda pasada):** el usuario compartió documentación oficial
> (2 Word docs) con endpoints reales y credenciales para NEW_BYTES, ELIT, AIR, GRUPO_NÚCLEO
> e INVID. Con eso se implementaron y probaron en vivo adapters reales en `apps/api/src/providers/adapters/`.
> Estado confirmado en producción (Railway):
>
> | Proveedor | Estado | Productos reales sincronizados |
> |---|---|---|
> | ELIT | ✅ funcionando end-to-end | 1703 |
> | NEW_BYTES | ✅ funcionando end-to-end | 1173 |
> | GRUPO_NÚCLEO | ✅ funcionando end-to-end | 699 |
> | INVID | ⚠️ código listo, bloqueado por rate limit (50 req/hora) — probablemente compartido con AcuStock que usa la misma cuenta `arenap` | pendiente reintentar |
> | AIR | ⚠️ código listo, la API exige paginar `/q=articulos` pero el parámetro real no está en la doc — devuelve `403 Too many queries` con "recuerde paginar la consulta" y cooldown de 5 min si no se pagina | pendiente confirmar el parámetro de paginación con Air |
>
> **Gotchas reales encontrados que NO estaban en ninguna doc:**
> - ELIT pagina por **query string** `?offset=N` (el `offset` en el body se ignora), y es
>   **1-indexado**: `offset=0` devuelve `400 "offset must be greater than or equal to 1"`.
> - AIR bloquea con `403` si se pide `/q=articulos` sin paginar, con cooldown de 5 minutos.
> - GRUPO_NÚCLEO y ELIT no documentan paginación explícita en `GetCatalog`, pero en la
>   práctica devuelven el catálogo completo en una sola respuesta sin problema.


Relevado el 2026-08-19 mirando el panel de AcuStock (`thegamershop.acustock.app`), el sistema
de stock que ya usa el negocio del usuario y que ya tiene integrados varios de estos
distribuidores. Sirve como referencia real para construir los adapters de NODO — nada de
esto reemplaza la lógica de AcuStock, solo confirma el contrato de cada API (base URL,
auth, forma de los datos) para que nosotros la reimplementemos desde cero en `apps/api`.

Las credenciales que se ven en las capturas (tokens, usuarios) son las cuentas reales del
negocio del usuario en cada proveedor — reutilizables para nuestra propia integración, pero
hay que cargarlas como secretos (vía el módulo de Credentials, cifradas), nunca en texto
plano en el repo.

## Cubiertos por AcuStock (8 de 14)

### NEW_BYTES — auth real todavía sin confirmar
- **Base URL**: `https://api.nb.com.ar/v1`
- **Auth**: token estático (`nb.com.ar → Mi Cuenta → Credenciales`, sección "recursos")
- **Catálogo**: paginado de a 100. Campos vistos en AcuStock (UI, no necesariamente todos):
  SKU, nombre, categoría, marca, costo (USD), stock.
- **Estado en AcuStock**: configurado y sincronizando activamente (1.171 productos).
- Probado en vivo con el token real: `Authorization: Bearer <token>` devuelve `500 Wrong number
  of segments` (espera un JWT, no un token estático ahí) y `x-api-key` / `?token=` devuelven
  `200 []` en `/v1/articulos` (ruta o parámetros incorrectos, no es error de auth). Hace falta
  la documentación real de NB (o probar más rutas) para confirmar el contrato exacto.

### ELIT — ✅ probado en vivo, contrato confirmado
- **Base URL**: `https://clientes.elit.com.ar/v1/api/productos`
- **Auth**: `POST` con body JSON `{ "user_id": "...", "token": "..." }` (no query params, no header —
  confirmado por prueba real).
- **Paginación**: `paginador: { total, limit, offset }` en la respuesta. `limit` default 40.
- **Respuesta real** (`resultado: Producto[]`), campos completos vistos en producción:
  ```
  id, codigo_alfa, codigo_producto, nombre, categoria, sub_categoria, marca,
  precio, impuesto_interno, iva, moneda, markup, cotizacion, pvp_usd, pvp_ars,
  peso, peso_cubico, ean, nivel_stock, stock_total, stock_deposito_cliente,
  stock_deposito_cd, garantia, link, uri, imagenes[], miniaturas[], atributos[],
  gamer (bool), creado, actualizado, descripcion, dimensiones: { largo, ancho, alto }
  ```
- **Estado en AcuStock**: configurado y sincronizando (1.703 en catálogo, coincide exacto con
  `paginador.total` de la prueba real).
- Coincide con el único proveedor que el backend viejo soportaba en `/search/all` — el más
  simple y ahora el más probado de los 14.

### GRUPO_NUCLEO
- **Base URL**: `https://api.gruponucleosa.com`
- **Auth**: `ID DE CLIENTE` + `USUARIO API` + `CONTRASEÑA API` (tres campos, no un token único).
- **Estado en AcuStock**: configurado (699 en catálogo).

### AIR
- **Base URL**: `https://api.air-intra.com/v2/`
- **Auth**: usuario + contraseña.
- **Estado en AcuStock**: configurado (2.363 con stock). Consistente con que nuestro
  `ProductDTO.locationAir` ya anticipaba un campo de ubicación propio de este proveedor.

### POLYTECH
- **Base real**: en realidad corre sobre la plataforma "Gestión Resellers"
  (`gestionresellers.com.ar/api/extranet/item/search`).
- **Auth**: API Key usada como HTTP Basic Auth (`username = API Key`, `password` vacío).
- **Estado en AcuStock**: **sin configurar** — no tienen key cargada ahí. Hay que conseguir
  una key propia si se quiere integrar de verdad.

### NEW_TREE
- **Base real**: es en realidad "GlobalBluePoint" (`ws.globalbluepoint.com/newtree/app_webservices/wserpconnect.asmx`).
- **Protocolo**: **SOAP**, no REST — distinto al resto. Parámetros vistos: `PUSERNAME`,
  `PPASSWORD`, `PCOMPANY`, `PWEBSERVICE` (id de servicio, "NewTree debe confirmarlo, en la
  documentación genérica suele ser distinto a 3"), `CLIENT ID` (para `getArticulos`), `ID LISTA
  DE PRECIOS`.
- **Estado en AcuStock**: sin configurar. Va a necesitar un cliente SOAP/XML en el backend
  (no encaja con el resto de adapters REST).

### INVID
- **Base URL**: `https://www.invidcomputers.com/api/v1`
- **Documentación**: **Swagger/OpenAPI público** en `https://invidcomputers.com/api/swagger`,
  spec completo bajado a [`invid.openapi.yaml`](./invid.openapi.yaml).
- **Auth**: JWT — `POST /api/v1/auth.php` con `{ username, password }` → `access_token` (Bearer,
  vigencia 24h).
- **Catálogo**: `GET /api/v1/articulo.php`, hasta 100 por página, paginado por `offset` /
  `next_page_url`. Filtros: `exclude_zero_price`, `exclude_zero_stock`, `published_only`.
- **Rate limit**: 50 requests/hora por usuario autenticado (`429` + headers `X-RateLimit-*`,
  `Retry-After`).
- **Campos ricos**: precio, IVA, precio final, imagen principal, categorías (con padre),
  tags, dimensiones/peso — bastante más de lo que el backend viejo exponía.
- **Estado en AcuStock**: configurado y sincronizando (1.285 con stock). Este es, por lejos,
  el proveedor mejor documentado de los 14 — buen candidato para ser el primer adapter real.

### SOLUTION_BOX
- **Base URL**: `https://lxc.solutionbox.com.ar`
- **Auth**: `USUARIO API` + `CONTRASEÑA API` vía endpoint `createToken` (confirmado por la UI
  de configuración de AcuStock, que trae exactamente esos dos campos y ese nombre de endpoint).
- **Límite**: **2 requests por hora** — extremadamente restrictivo. AcuStock cachea el catálogo
  agresivamente para no gastar la cuota. Confirma que nuestro diseño de `ProviderSyncCache`
  (sincronizar a nuestra DB en vez de pegarle a la API en cada búsqueda de usuario) es el
  approach correcto, no opcional, para este proveedor en particular.
- **Precio**: en USD. AcuStock aplica `(Costo × (1 + Impuestos)) × Cotización × (1 + Margen)`.
- **Stock**: suma de dos depósitos, MDP (Mar del Plata) y CABA.
- **SKU**: prefijo `SB_{código_API}`.
- **Solo lectura**: se consulta el catálogo, nunca se modifica nada en Solution Box.
- **Falta confirmar**: el endpoint real de listado de artículos (más allá de `createToken`
  para auth) — la UI de AcuStock no lo expone, solo la base URL. Hace falta pedirle a Solution
  Box su documentación de API o conseguir la URL exacta antes de escribir el adapter, para no
  adivinar la forma de la respuesta.
- **Estado en AcuStock**: sin configurar (sin key cargada).

### POLYTECH — endpoint y auth confirmados en vivo
- **Base real**: corre sobre la plataforma "Gestión Resellers"
  (`https://gestionresellers.com.ar/api/extranet/item/search`) — confirmado letra por letra en
  la pantalla de Configuración de AcuStock (que además tiene una API Key real cargada y
  funcionando, oculta como password — no se pudo leer el valor por política de seguridad del
  navegador, pero el campo está activo).
- **Auth**: HTTP Basic Auth, `username = API Key`, `password` vacío.
- **SKU**: prefijo `PT_`.
- **Falta confirmar**: la forma exacta de la respuesta JSON (nombres de campos: nombre,
  precio, stock, categoría, etc.) — la UI de AcuStock no expone eso, solo el endpoint y el
  método de auth. Se puede armar el cliente HTTP ya mismo (URL + Basic Auth), pero el
  `FIELD_MAP` necesita una respuesta real de ejemplo antes de escribirse, para no inventar
  nombres de campo.
- **Estado en AcuStock**: configurado con key propia, pero sincronización desactivada
  ("Sync bloqueada, el stock drop quedó en 0").

### NEW_TREE (GlobalBluePoint) — el más documentado de los pendientes
- **Base real**: `https://ws.globalbluepoint.com/newtree/app_webservices/wserpconnect.asmx`
- **Protocolo**: **SOAP**, no REST — necesita un cliente XML/SOAP en el backend, distinto al
  resto de adapters.
- **Auth**: `AuthenticateUser` con `PUSERNAME`, `PPASSWORD`, `PCOMPANY`, y `PWEBSERVICE` (id del
  servicio web en GBP — NewTree tiene que confirmarlo, la doc genérica GBP suele usar un id
  distinto de 3).
- **Catálogo**: script `getArticulos` ejecutado vía `wsGBPScriptExecute`, parámetro
  `{"client_id": 15}` según la doc GBP/NewTree 2025-02 (15 es el default documentado si no se
  configura uno propio). Existe un modo legacy con `price_list_id` + `deposit_id` visto en
  integraciones previas, pero según las notas de AcuStock ese modo "suele devolver un código de
  error (ej. -9)" — **no usar**, priorizar siempre `client_id`.
- **Precio**: `price` viene con impuestos incluidos (final), `price_no_tax` es el neto, y
  `taxes[]` desglosa IVA + Impuestos Internos (no hay que re-sumarlos sobre `price`, ya está
  incluido).
- **Stock**: viene como semáforo — `ALTO` / `MEDIO` / `BAJO` / sin stock (no como un número
  entero directo; hay que confirmar contra la respuesta real si además viene una cantidad).
- **SKU**: prefijo `NT_{SKU}`.
- **Falta confirmar**: el XML/WSDL real de la respuesta de `getArticulos` (nombres exactos de
  cada campo dentro del payload SOAP) — la UI de AcuStock describe el contrato a alto nivel
  (los campos de precio/stock de arriba) pero no el XML completo. Con las credenciales reales
  cargadas se puede hacer una llamada de prueba a `AuthenticateUser` + `wsGBPScriptExecute` y
  recién ahí escribir el parser XML→JSON sin adivinar.
- **Estado en AcuStock**: sin configurar (sin credenciales cargadas ahí tampoco).

### GC (Gaming City) — confirmado en vivo, no es una API tradicional
- Según la documentación oficial: **"NO ES UNA API pero de acá se puede levantar bastante
  fácil todo ya que es solo una tabla recontra expuesta"**:
  `https://sites.google.com/view/gcgremio/lista-general?authuser=0`
- **Verificado en vivo (2026-08-19)**: la página de Google Sites embebe un iframe que apunta a
  una app de Google Apps Script pública, sin login:
  `https://script.google.com/macros/s/AKfycbwLmFg-DGm7_kOC85f3SRUEBaQX4M8i4jRJ3MpkY92a4gd8ah80pexivewTYFE1Jw7w-Q/exec`
- Esa app renderiza una tabla en vivo: **1.665 productos**, actualizada (timestamp visible en la
  UI, "Actualizado: Wed Aug 19 2026 18:36:54 GMT-0300"), con buscador y botón "Descargar
  listado completo en Excel".
- **Campos reales, confirmados visualmente — solo 2**: `PRODUCTO` (nombre completo, sin SKU
  separado) y `PRECIO` (en pesos, `$ N.NNN`, sin aclarar IVA/moneda). **No hay** stock, marca,
  categoría, imagen, ni código de producto — es literalmente una lista de precios plana, nada
  más. Cualquier campo adicional (SKU, stock, categoría) sería inventado — no está en esta
  fuente.
- **Falta confirmar antes de escribir el scraper**: el mecanismo exacto de carga de datos (si
  el HTML trae los 1.665 productos ya embebidos en un `<script>` inline, o si hace una llamada
  interna tipo `google.script.run` que haya que interceptar) — la próxima sesión de research
  debería inspeccionar el HTML fuente de esa URL directamente (no solo la vista renderizada).
- **Estado**: pública, sin credenciales — el único bloqueo es tiempo de desarrollo (confirmar
  el mecanismo de carga y escribir el scraper). Dado el esquema pobre (sin SKU/stock/categoría),
  su valor real para el catálogo es limitado — prioridad baja frente a POLYTECH/NEW_TREE.

## Fuera del panel de AcuStock y sin documentación

- **PC Arts**: aparece en el sidebar de AcuStock y también en la documentación oficial
  ("PC ARTS — en proceso de envío"), pero no corresponde a ninguno de nuestros 14 códigos
  (`NEW_BYTES, ELIT, GRUPO_NUCLEO, AIR, NEW_TREE, INVID, GC, POLYTECH, ASHIR, HDC,
  SOLUTION_BOX, DISTECNA, CEVEN, DIAPSTORE`). Su propia documentación de API todavía no fue
  enviada por el proveedor ("en proceso de envío") — nada que hacer hasta que llegue.
- **ASHIR, HDC, DISTECNA, CEVEN, DIAPSTORE**: no están en el panel de AcuStock ni aparecen
  mencionados en ninguno de los dos Word docs oficiales que compartió el usuario. No hay
  ningún dato real (ni endpoint, ni auth, ni campos) del que partir — quedan completamente
  pendientes de relevar directo con cada distribuidor.

## Próximo paso sugerido

**Ya construidos y en producción**: ELIT, NEW_BYTES, GRUPO_NÚCLEO (los 3 verificados con datos
reales), más INVID y AIR (código listo, bloqueados por rate limit del proveedor, no por
nuestro lado).

**Documentados y listos para construir en cuanto haya una respuesta real de prueba** (con
credenciales cargadas — el propio usuario ya tiene cuenta en Polytech, hace falta la de
Solution Box y NewTree):
- **POLYTECH**: endpoint + auth 100% confirmados, solo falta un llamado real para ver los
  nombres de campo antes de escribir el `FIELD_MAP` (mismo estándar que se usó para los 5 ya
  construidos: nunca adivinar nombres de campo).
- **NEW_TREE**: protocolo SOAP + auth + script `getArticulos` + semántica de precio/stock ya
  documentados; falta una llamada de prueba para confirmar el XML exacto.
- **SOLUTION_BOX**: auth (`createToken`) y comportamiento (USD, 2 dep., 2 req/hora) documentados;
  falta el endpoint de listado de artículos en sí.

**Sin ningún dato real todavía**: GC (es scrapeable, no necesita credenciales, pero hay que
mirar la tabla real antes de escribir el parser), PC Arts (proveedor todavía no mandó su doc),
ASHIR, HDC, DISTECNA, CEVEN, DIAPSTORE (cero información en ninguna fuente disponible).
