# New Tree: integración por portal (catálogo, checkout, cuenta corriente)

Fecha: 2026-09-05. Estado: implementado.

## Contexto

New Tree (`NEW_TREE`) corre sobre GlobalBluePoint, un ERP con portal ASP.NET WebForms
en `https://www.newtree.com.ar`. El distribuidor ofrece un SOAP (`wserpconnect.asmx`),
pero el portal expone todo lo que Nodo necesita y ya lo usa el comercio a diario, así
que la integración emula al navegador contra el portal. Todo se confirmó en vivo con
la sesión del usuario antes de escribir código.

## Cómo habla Nodo con el portal

- **Sesión**: `GET /HOME/newtree.aspx` entrega la cookie `ASP.NET_SessionId` y el
  `hidWebSiteID` (GUID fijo del sitio) que va en cada llamada.
- **Acciones**: ASP.NET AJAX PageMethods, `POST /wfmWebSite2.aspx/wsNRW_<método>`
  con JSON y la cookie; la respuesta es `{"d": "<string>"}` separado por `,` o `;`.
  - `wsNRW_setLogin(guidWS_Id, strWebNickName, strWebPassword)` →
    `customerId,salesTermsId,priceListId,storId` (`-1` si falla).
  - `wsNRW_SessionWrite(guidWS_Id, strSessionName, strSessionValue)` → `cantidad=52`
    para paginar de a 52.
  - `wsNRW_DeleteAllCart`, `wsNRW_AddCart(guidWS_Id, intItemId, decItemQTY, -1, "")` →
    `code,msg` (`code ≤ 0` es rechazo), `wsNRW_Calculate(guidWS_Id, 1)` →
    `code;qty;total;tax;subtotal;interest;discount`, `wsNRW_SetDeliveryAddress`,
    `wsNRW_SaveSaleOrder(guidWS_Id)` → `orderId,msg`.
- **Catálogo**: listados HTML `/ARTICULOS/<slug>/CAT_ID=n/SCAT_ID=n/m=0/BUS=;/A_PAGENUMBER=p/newtree.aspx`
  (tarjetas `.product`: `COD<itemId>`, `.price.semaforoN`, `.ivaprod`, imagen
  `<EAN>_400.jpg`) y ficha `/DETALLE/x/ITEM_ID=n/newtree.aspx` (Código = EAN,
  Modelo = part number, Marca, IVA, descripción). Con sesión se ven los precios del
  cliente; sin sesión, los de lista.
- **Cuenta**: `/CUENTACORRIENTE/FECHAI=yyyymmdd/FECHAF=yyyymmdd/newtree.aspx`
  (tabla de comprobantes + saldos en el script de la página) y
  `/MISPEDIDOS/FECHAI=…/FECHAF=…/newtree.aspx`. Los PDF salen de
  `wfmPrintMyDocument.aspx?<token cifrado>`.

## Componentes (apps/api/src/providers)

| Archivo | Responsabilidad |
|---|---|
| `new-tree-web-client.ts` | Cookie jar, `connect()` anónimo, `login()`, `pageMethod()`, `getHtml()`, `getBuffer()`. |
| `new-tree-catalog.parser.ts` | Funciones puras: menú de categorías, tarjetas, paginador, ficha, mapeo a `NormalizedProduct`. |
| `adapters/new-tree.adapter.ts` | `syncAll` recorre subcategorías y el listado general; `enrichDetails` lee fichas en background (marca, modelo, IVA, descripción). |
| `new-tree-account.parser.ts` | Saldos, movimientos (con token de PDF) y pedidos web. |
| `new-tree-account.service.ts` | `getAccount(tenantId, creds, {from,to})`, `getDocument(creds, token)`. |
| `new-tree-order.service.ts` | `preview`, `submitDraft` (background), `approveDraft`; guarda `ProviderOrder`. |
| `dto/new-tree-checkout.dto.ts` | `items[]`, `deliveryAddress?`, `notes?`, `background?`. |

Rutas: `GET /providers/NEW_TREE/account?from&to&refresh`, `GET /providers/NEW_TREE/documents?token&name`,
`GET /providers/NEW_TREE/drafts[/:id]`, `POST /providers/NEW_TREE/checkout/preview`,
`POST /providers/NEW_TREE/checkout/draft`. La aprobación de pedidos (vendedor → dueño)
pasa por `OrdersService.send` como el resto.

## Decisiones

- **Precio**: el portal muestra precio final con IVA; el neto se deriva con la
  alícuota de la tarjeta (`Incluye IVA 10,50 %`). `NEW_TREE` entra en
  `PROVIDERS_WITH_IVA_RATE`.
- **Stock**: `semaforo1` = sin stock (`stock: 0`); el resto queda `stock` desconocido
  con `stockStatus: "Disponible"`. El portal no informa cantidades.
- **Checkout**: el portal no ofrece pago ni entrega (los coordina el vendedor). Nodo
  pide dirección opcional y notas; confirma con `SaveSaleOrder`.
- **Ítems del preview**: los precios por línea salen del catálogo sincronizado de
  Nodo (`TenantProductOffer`), los totales del `Calculate` del portal.
- **Credenciales**: usuario y contraseña del portal, cargados por el comercio en
  Nodo → Proveedores → New Tree → Mi cuenta. Nunca en código ni en el repo.
- **Sin cuenta**: `publicCatalog: true`, el catálogo sincroniza igual con precios de lista.

## Bloqueo de Cloudflare

newtree.com.ar está detrás de Cloudflare y responde `403 Attention Required` a las IP de
datacenter (Railway, IP saliente 208.77.246.12 al 2026-09-05); desde una IP residencial
argentina responde normal. Salidas: que New Tree habilite la IP del servidor, o un proxy
HTTP con IP permitida en `NEW_TREE_PROXY_URL` (`http://user:pass@host:puerto`), que el
cliente usa para todo el tráfico de New Tree. El error se informa con ese texto.

## Pendiente

- Detalle de líneas de un pedido web (el portal lo muestra solo en su sesión).
- Unificar la vista de cuenta entre todos los distribuidores (pedido del usuario para después).
