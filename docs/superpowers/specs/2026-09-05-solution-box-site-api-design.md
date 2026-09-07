# Solution Box: integración por la API interna del sitio

Fecha: 2026-09-05. Estado: implementado, a verificar con la cuenta del comercio.

## Contexto

Solution Box (`SOLUTION_BOX`) tiene una API oficial en `lxc.solutionbox.com.ar`
(`createToken` + listado, 2 pedidos por hora) que exige credenciales propias y cuya
documentación no es pública; probar rutas a ciegas la bloquea (6 pedidos cada 10 min).
Su tienda `www.solutionbox.com.ar` es una app React que usa una API JSON interna con
el mismo login del cliente. Se mapeó en vivo con la sesión del usuario y es lo que Nodo
emula. Railway alcanza ambos hosts (no hay Cloudflare).

## API interna (confirmada en vivo)

Base `https://www.solutionbox.com.ar/api`, auth `Authorization: Bearer <token>`.

| Uso | Llamada |
|---|---|
| Login | `POST /session/login {email,password}` → `{token}` |
| Cliente | `GET /clientes` → `cliente` (Id usuario web, Cliente nro, Condicion_Pago, Tipo_entrega, domicilios, Cotizacion) |
| Rubros | `GET /articulos/categorias` (árbol con `Hijos`) |
| Listado | `GET /articulos/info/categoria/:code?limit=1000&offset=0[&Stock=1]` → `{articulos,length}`; con `Stock=1` trae `Precio` (neto, `Moneda_Signo` u$s/$) |
| Ficha | `GET /articulos/detalle?sku=` → `articulo.descripcionArray`, `Imagenes` |
| Imagen | `https://www.solutionbox.com.ar/articulos/thumbs/<archivo>` |
| Cotización | `POST /pedidos/proforma {precompra:{items:[{Alias,Precio,Cantidad,Moneda}],cond_pago,tipo_entrega,Direccion_entrega}}` → totales en pesos y dólares (IVA, `Pib` = percepción IIBB, `Per_iva`, `Cotiz_Dolar`) |
| Condiciones de pago | `GET /pedidos/constantes/condiciones_pago` |
| Confirmar | `POST /checkout/pedido/success {precompra:<proforma>, cliente:{ID_CLIENTE,name_,lastname,email,dni,telefono,calle,numero,localidad,codigoPostal}}` |
| Pedidos | `GET /pedidos/ordenes/cliente/:nro?Limit&Offset` → `{pedidos}`; `GET /pedidos/orden/:nro/:ext` |
| Factura PDF | `GET /pedidos/orden/factura/:nro/:ext` |

El carrito del sitio (`/compra/cart`) no hace falta: la proforma acepta los ítems
directamente. El sitio no publica cuenta corriente.

## Componentes (apps/api/src/providers)

| Archivo | Responsabilidad |
|---|---|
| `solution-box-web-client.ts` | Login, cliente, get/post/delete/getBuffer con Bearer. |
| `solution-box.parser.ts` | Funciones puras: rubros, artículo → `NormalizedProduct`, ficha, proforma, pedidos. |
| `adapters/solution-box.adapter.ts` | `syncAll` por rubro (dos pasadas: con stock y sin filtro); `enrichDetails` lee fichas en background. |
| `solution-box-order.service.ts` | `preview` (proforma), `submitDraft`, `approveDraft`; guarda `ProviderOrder`. |
| `solution-box-account.service.ts` | Pedidos, detalle y factura PDF. |
| `dto/solution-box-checkout.dto.ts` | `items[]`, `paymentCondition?`, `deliveryType?`, `background?`. |

Rutas: `GET /providers/SOLUTION_BOX/account`, `GET /providers/SOLUTION_BOX/orders/:number/:ext[/invoice]`,
`GET /providers/SOLUTION_BOX/drafts[/:id]`, `POST /providers/SOLUTION_BOX/checkout/preview|draft`.

## Decisiones

- **Precio**: neto en USD (o ARS según `Moneda_Signo`). La alícuota de IVA no viene por
  producto; sale de la proforma, así que `SOLUTION_BOX` no entra en `PROVIDERS_WITH_IVA_RATE`.
- **Stock**: cantidad real (`Stock`). Sin stock no hay precio: el producto queda sin precio.
- **Checkout**: condición de pago (lista del sitio, por defecto la del cliente) y tipo de
  entrega (1 retira, 2 entrega a la dirección de la cuenta). La confirmación manda la
  proforma tal cual la devolvió el sitio.
- **Número de pedido**: la respuesta de `pedido/success` no se vio en vivo (no se creó
  un pedido real); `orderNumberFrom` busca el número en las claves habituales y, si no
  aparece, deja el pedido como creado con aviso.
- **Credenciales**: mail y contraseña del sitio, cargados por el comercio en Nodo.

## Pendiente

- Verificar con la cuenta real: login, sync completo, un pedido chico.
- API oficial `lxc` cuando Solution Box entregue credenciales y documentación.
