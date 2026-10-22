# PC Arts — API de operaciones

Portado de `PcArtsClient.php` (AcuStock). **No probado contra la API real**.

- **Clave**: `PC_ARTS` · prefijo SKU `PA_` · adapter `apps/api/src/providers/adapters/pc-arts.adapter.ts`.
- **Credenciales** (`POST /credentials`): `api_token` (obligatorio), el token de sesión que da PC Arts.
- **Endpoint**: `GET https://api.pcarts.com/operations?offset=&limit=` con headers `x-session-token: <token>` y `operation`:
  - `1005` catálogo (nombre `sku_desc`, `brand`, `category_desc`, imágenes), de a 400;
  - `1004` stock y precio (`price`, `stock`, `tax_iva_rate`, `tax_ii_rate`), de a 500.
  Ambas responden `{ Products: [...], Paging: { total } }`. Se recorren las dos y se unen por `sku` (lo de 1004 manda).
- **Mapeo**: `externalId`/`sku` = `sku` · `name` = `sku_desc` (o el sku) · `price` neto en **USD** (AcuStock lo toma siempre así) · `ivaPercent` = `tax_iva_rate` · internos `tax_ii_rate` (o `tax_internal_rate`) · `finalPrice` = neto × (1 + IVA + internos) · imagen: `images[0].url`, `image_url`, `image`, `IMAGE_URL` o `thumbnail`. EAN y part number solo si vienen (`ean`/`upc`, `part_number`/`mpn`): AcuStock no los usa y no sabemos si existen. Un sku que está solo en 1005 queda sin precio ni stock (no se inventan).
- **Límites**: 0,5 s entre páginas (AcuStock usa 0,3 s), reintento de 5xx/caídas hasta 2 veces con espera; un 429 **no** se reintenta: pausa la sync y se prueba sola una vez por día. Sync como mucho cada 2 h, "Sincronizar ahora" cada 30 min. Tope de 200 páginas por operación.
- **Pedidos / checkout**: no. Solo catálogo.
