# Microglobal — web service SOAP WSMG

Portado de `MicroglobalClient.php` (AcuStock). **No probado contra el WS real**.

- **Clave**: `MICROGLOBAL` · prefijo SKU `MG_` · adapter `apps/api/src/providers/adapters/microglobal.adapter.ts`.
- **Credenciales** (`POST /credentials`): `cliente` (código de cliente, obligatorio), `usuario` (vacío si la cuenta es el administrador), `password` (obligatoria), `moneda` opcional `USD`/`ARS` (default USD: el WS no dice la moneda del precio).
- **Endpoint**: `POST https://ws.microglobal.com.ar/WSMG_res/WSMG.asmx`, `SOAPAction: "http://tempuri.org/GetCatalog"`, cuerpo `<GetCatalog xmlns="http://tempuri.org/"><cliente/><usuario/><password/></GetCatalog>`. Devuelve el catálogo completo de una vez (timeout 180 s). AcuStock deja cambiar la URL; NODO la fija para que una cuenta no pueda apuntar la API a otro host.
- **Respuesta**: `GetCatalogResult` con `result` (0 = OK), `message` y `listProducts` (un elemento por producto con un hijo por campo). `soap:Fault` o `result ≠ 0` es error con el mensaje de Microglobal. `GetCategories` existe pero no se usa.
- **Mapeo**: `externalId`/`sku` = `partNumber` (código MG) · `partNumber` = `partNumber_ori` (del fabricante) · `ean` = `upc` · `name` = `descripcion` · `marca`, `categoria` · `price` = `precio` (neto) · `ivaPercent` = `iva_pct` · internos `ii_pct` aparte · `finalPrice` = neto × (1 + IVA + internos) · `stock` · `peso` en gramos → kg. `ancho`/`alto`/`profundidad` quedan en `raw` (unidad sin confirmar). No trae imágenes.
- **Límites**: sync como mucho cada 2 h (default de AcuStock), "Sincronizar ahora" cada 30 min, pausa en el primer 403/429 con prueba diaria.
- **Pedidos / checkout**: no. Solo catálogo.
