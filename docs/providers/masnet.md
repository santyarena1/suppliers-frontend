# Masnet — catálogo por CSV

Portado de `MasnetClient.php` (AcuStock). **No probado contra el portal real**: el primer sync con una cuenta de verdad es la prueba.

- **Clave**: `MASNET` · prefijo SKU `MS_` · adapter `apps/api/src/providers/adapters/masnet.adapter.ts`.
- **Credenciales** (`POST /credentials`): `user_id` (ej. `api-12345`) y `token`. Las dos obligatorias.
- **Endpoint**: `GET https://masnet.com.ar/api/v1/productos/csv?user_id=…&token=…` (`Accept: text/csv`). Un solo pedido trae el catálogo entero. El token va en la URL: los errores se enmascaran antes de loguearse.
- **Formato**: CSV con coma, cabecera obligatoria (si falta una columna, no se toma):
  `id, codigo_alfa, codigo_producto, nombre, categoria, sub_categoria, marca, precio, impuesto_interno, iva, moneda, markup, cotizacion, pvp_usd, pvp_ars, stock_total, stock_deposito_cliente, stock_deposito_cd, link, imagen, miniatura, actualizado`. Puede venir con BOM y comillas escapadas como `\"` (AcuStock lee con `fgetcsv` y escape `\`).
- **Mapeo**: `externalId`/`sku` = `codigo_alfa` (o `id` si falta) · `partNumber` = `codigo_producto` · `ean` si viene una columna `ean` · categoría `categoria > sub_categoria` · `price` = `precio` (neto) · `ivaPercent` = `iva` · `finalPrice` = precio × (1 + IVA) · moneda `1/P/ARS` → ARS, el resto USD · `stock_total` es texto: número → stock, "sin stock" → 0, otra cosa → sin dato con el texto en `stockStatus` · imagen `imagen` o `miniatura` · `productUrl` = `link`.
- **Internos**: según AcuStock `precio` **ya incluye** el impuesto interno; no se suma `impuesto_interno` otra vez. El IVA se calcula sobre ese precio (igual que AcuStock).
- **Límites**: menos de 5 filas válidas o una página HTML se rechaza (no pisa el catálogo). Sync automática como mucho cada 2 h (`PROVIDER_MIN_SYNC_MINUTES`), "Sincronizar ahora" espera 30 min; un 403/429 pausa la sync y se reintenta sola una vez por día. AcuStock lo corre cada 2 h por defecto y cachea el CSV 6 h.
- **Pedidos / checkout**: no. Solo catálogo; el comercio compra en el portal de Masnet.
