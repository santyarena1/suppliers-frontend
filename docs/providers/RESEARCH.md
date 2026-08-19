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
- **Auth**: usuario + contraseña vía endpoint `createToken`.
- **Límite**: **2 requests por hora** — extremadamente restrictivo. AcuStock cachea el catálogo
  agresivamente para no gastar la cuota. Confirma que nuestro diseño de `ProviderSyncCache`
  (sincronizar a nuestra DB en vez de pegarle a la API en cada búsqueda de usuario) es el
  approach correcto, no opcional, para este proveedor en particular.
- **Estado en AcuStock**: sin configurar.

## Fuera del panel de AcuStock

- **PC Arts**: aparece en el sidebar de AcuStock pero no corresponde a ninguno de nuestros
  14 códigos (`NEW_BYTES, ELIT, GRUPO_NUCLEO, AIR, NEW_TREE, INVID, GC, POLYTECH, ASHIR, HDC,
  SOLUTION_BOX, DISTECNA, CEVEN, DIAPSTORE`). Falta confirmar con el usuario si es un alias
  de alguno de estos (¿ASHIR?) o directamente un proveedor extra no contemplado originalmente.
- **GC, ASHIR, HDC, DISTECNA, CEVEN, DIAPSTORE**: no están en el panel de AcuStock — el
  usuario no los tiene integrados ahí. Para estos 6 hace falta ir directo a la página de cada
  distribuidor con las credenciales de API (según el plan original del usuario).

## Próximo paso sugerido

Empezar el primer adapter real por **INVID** (documentación pública completa, ya validado en
producción por AcuStock) o por **ELIT** (API más simple, único que el backend viejo ya usaba).
Los 6 proveedores sin cobertura acá quedan pendientes de relevar directamente en el sitio de
cada distribuidor.
