# Cerrar el Tipo 1 — Comercio

Visión para validar, no un backlog cerrado. Si algo no coincide con cómo lo
imaginás, se cambia acá antes de tocar código.

El aislamiento (fases 0–5 de `docs/PLAN_AISLAMIENTO.md`) ya está en producción.
Este documento cubre lo que le falta al **comercio** para operar solo, sin que
el superadmin le arme la vida. Distribuidores y marcas vienen después; al final
hay un borrador de visión para discutirlos, no para implementarlos ahora.

---

## 1. Cómo imagino un comercio en NODO

Un comercio es un local (o una cadena chica) que **compra** a distribuidores.
NODO no es su sistema de venta al público: es el lugar donde el equipo del
local ve stock y precio de *sus* cuentas, arma el pedido y lo manda.

Tres personas típicas, no cinco:

| Quién en el local | Rol en NODO | Qué hace |
|---|---|---|
| Dueño o encargado general | `OWNER` | Crea al equipo, carga las cuentas de los distribuidores, mira números, firma lo que armó un vendedor, confirma él mismo si compra. |
| Encargado de compras | `BUYER` | Busca, compara, llena el carrito y **confirma**. Está autorizado a comprar. |
| Vendedor de mostrador | `SELLER` | Busca y arma el carrito para no perder la venta, pero **no manda el pedido**. Queda esperando al dueño. |

Más dos roles que existen porque el esquema ya los tiene, y sirven:

| Quién | Rol | Qué hace |
|---|---|---|
| Encargado de sucursal / mano derecha | `ADMIN` | Igual que el dueño en el día a día (equipo, cuentas, firmar pedidos). No puede borrar la organización ni echar al dueño. |
| Contador, socio, mirón | `VIEWER` | Ve catálogo, precios y pedidos. No toca carrito, cuentas ni pedidos. |

Si el comercio tiene **una sola persona**, esa persona es `OWNER` y no hay
flujo de aprobación: confirma directo. Eso ya está.

Lo que el comercio **no** es: un panel de marca, un CRM de clientes finales, ni
un lugar para descubrir todos los mayoristas del país. Ve solo a quienes ya le
dieron cuenta o un código.

---

## 2. El día a día (si el Tipo 1 estuviera cerrado)

1. El dueño entra y ve **su** organización arriba, no un usuario suelto.
2. En Proveedores aparecen solo los que tiene. Si New Bytes le pasó un código,
   lo canjea y recien ahí existe New Bytes. Si no, no existe.
3. Carga usuario y contraseña del portal **una vez**. Las ve todo el equipo,
   porque la cuenta es del local.
4. Configura el markup (el margen que el local le pone al precio de lista) y
   el umbral de stock. Se ve al toque en la búsqueda, sin resincronizar.
5. En cada proveedor aparece **el vendedor que le asignó ese distribuidor**
   (nombre y mail), para llamarlo. Hoy eso ya se muestra en el dashboard.
6. El vendedor de mostrador busca, agrega al carrito, aprieta pedir, y ve
   “quedó esperando al dueño”. El dueño entra a Pedidos, mira, aprueba o
   rechaza. Recién ahí sale al mayorista.
7. El encargado de compras hace lo mismo pero el botón dice “Confirmar pedido”
   y sale directo.
8. El dueño invita a un vendedor nuevo desde Configuración → Equipo, sin
   llamarme a mí ni pasar por superadmin. Le aparece una contraseña una sola
   vez, igual que hoy en el panel.

Eso, para mí, es “Tipo 1 cerrado”.

---

## 3. Qué ya está (no rehacer)

- Organización en la sesión (`tenantId`, tipo, rol).
- Credenciales y config de sync por comercio.
- Precio y stock por comercio; markup al leer.
- Búsqueda cerrada a proveedores vinculados + canje de código.
- Pedidos de la organización, con retención si es `SELLER`.
- Árbol de superadmin, “Entrar como”, contraseñas generadas.
- Vendedor asignado visible en el dashboard de proveedores.
- Canje de código en `/proveedores`.

---

## 4. Qué le falta, y por qué importa

Ordenado por lo que impide usar el comercio de verdad, no por lo más lindo.

### 4.1 Los roles no se viven en la pantalla

Hoy el backend frena al vendedor al confirmar y al vaciar el catálogo. En la
interfaz, un `VIEWER` puede agregar al carrito, un `SELLER` ve el mismo botón
de confirmar hasta que la API lo rechaza, y cualquiera del comercio puede
cargar o borrar la cuenta de New Bytes.

Sin esto el modelo de roles es un documento. Con esto, cada persona ve solo
las acciones que le corresponden.

Propuesta:

| Acción | OWNER | ADMIN | BUYER | SELLER | VIEWER |
|---|---|---|---|---|---|
| Buscar / ver ficha | sí | sí | sí | sí | sí |
| Agregar al carrito | sí | sí | sí | sí | no |
| Confirmar pedido | sí | sí | sí | no (queda en espera) | no |
| Aprobar / rechazar | sí | sí | no | no | no |
| Cargar credenciales y markup | sí | sí | no | no | no |
| Sincronizar catálogo | sí | sí | no | no | no |
| Canjear código | sí | sí | no | no | no |
| Invitar / echar gente | sí | sí (no al OWNER) | no | no | no |

### 4.2 El dueño no puede armar su equipo

Hoy las personas del local las crea el superadmin. Eso no escala: cada
vendedor nuevo no puede depender de nosotros.

Propuesta: en Configuración, una solapa **Equipo** para `OWNER`/`ADMIN`.

- Listar quién está, con rol y si está activo.
- Invitar: nombre de usuario, mail, rol (`BUYER` / `SELLER` / `VIEWER` /
  `ADMIN`). Contraseña generada, se muestra una sola vez.
- Cambiar rol (sin poder sacarle el último `OWNER`).
- Desactivar. No borrar: queda el rastro de quién armó cada pedido.

El superadmin sigue pudiendo hacer lo mismo desde el árbol. Es red de
seguridad, no el camino normal.

### 4.3 El carrito vive en el navegador

La API ya tiene carrito por persona-dentro-de-organización. La web sigue
usando `localStorage`. Consecuencia:

- Dos vendedores en PCs distintas no se pisan (eso está bien, el carrito es
  personal), pero el mismo vendedor en el celular y en la caja **sí se pisa**:
  son dos carritos que no se conocen.
- Si limpia el navegador, pierde el pedido a medio armar.
- Un `VIEWER` no se puede frenar de verdad: el carrito ni pasa por el server.

Propuesta: la web deja de guardar el carrito en el browser y usa `GET/POST
/cart`. Al entrar, se hidrata. Al agregar, se persiste. Si no hay
organización (superadmin), no hay carrito — igual que el catálogo.

### 4.4 Credenciales y markup los puede tocar cualquiera del local

La cuenta en el distribuidor es del comercio, no de la persona. Eso ya está
en la base. Falta que **solo dueño y admin** las carguen, las borren y
cambien el markup. Un vendedor que “prueba” una clave deja al local sin
comprar.

### 4.5 El comercio no se administra a sí mismo

Configuración hoy es tema, moneda e IVA. Falta lo de negocio:

- Nombre del local (el dueño puede corregir el nombre provisional de la
  migración).
- Equipo (4.2).
- Un resumen de con quién está vinculado, con el vendedor de cada
  distribuidor.

No haría un “alta de comercio” público todavía: el primer usuario lo sigue
creando el superadmin (o un onboarding más adelante). Cerrar Tipo 1 no es
abrir el registro masivo.

### 4.6 Cosas chicas que dejan el Tipo 1 a medias

- **Portal de Marcas en el menú del comercio.** Es el módulo viejo, fuera de
  alcance. Mientras Tipo 3 no exista, yo lo **escondería** para no mezclar
  dos mundos. El superadmin sigue viéndolo.
- **Estado vacío de la búsqueda.** Si no tiene proveedores, hoy parece que
  “no hay resultados”. Debería decir “conectá un distribuidor” y ofrecer el
  canje de código.
- **Precios con `needsResync`.** Los que había antes de separar ficha y
  oferta traen el markup viejo adentro. No es un feature: es avisarle al
  dueño “sincronizá de nuevo para ver el precio real” y, en staging, hacerlo.
- **Documentación.** `docs/ARQUITECTURA_TENANTS.md` todavía marca como
  pendiente cosas que ya están. Si no lo alineamos, el próximo lee basura.

### 4.7 Lo que conscientemente dejaría afuera del Tipo 1

- Aplicar el `% de descuento` del vínculo al precio. El número se carga en
  el árbol y no hace nada. Eso es herramienta del **distribuidor** (Tipo 2):
  él decide el descuento, el comercio lo ve. Lo dejamos planteado, no lo
  implementamos ahora.
- QR. El código escrito ya se canjea. El QR lo genera el distribuidor.
- Chat con el vendedor del mayorista.
- Carrito compartido entre vendedores del mismo local. El pedido sí es del
  local; el carrito a medio armar es de la persona. Si querés carrito
  compartido, es otra decisión.
- Que un `BUYER` necesite un tilde del dueño para poder confirmar. Hoy
  confirmar es parte del rol. Si querés el tilde, lo agregamos.

---

## 5. Cómo lo cerraría, en tandas

Cada tanda se prueba en staging con “Entrar como” (vendedor, comprador,
dueño, mirón) y recién después va a producción. El comercio de verdad
(`testuser1`) no se usa de conejillo.

| Tanda | Qué | Se siente listo cuando… |
|---|---|---|
| **T1 — Roles en la cara** | La UI y la API respetan la tabla de 4.1. Botones que no corresponden no están, no “dan error”. | Entro como vendedor y no puedo cargar la clave de Elit ni confirmar. Entro como mirón y no hay “agregar”. |
| **T2 — Equipo del local** | Solapa Equipo en Configuración. Invitar, rol, desactivar, contraseña de una sola vez. | El dueño de Tecno Store invita un vendedor sin pasar por superadmin. |
| **T3 — Carrito en el servidor** | La web usa `/cart`. Superadmin sin carrito. | El mismo usuario ve el mismo carrito en dos browsers. Un mirón no puede agregar ni por API. |
| **T4 — Pulido** | Esconder Marcas al comercio, vacío con canje, aviso de resync, alinear docs. | Un comercio nuevo entiende qué hacer en 30 segundos. |

No mezclaría T2 y T3 en el mismo empujón: son superficies distintas.

---

## 6. Decisiones que necesito de vos

Estas cambian el plan. El resto lo puedo resolver yo.

1. **¿El `ADMIN` del local existe?** Yo lo dejaría: es el encargado que no es
   el dueño. Si preferís solo Dueño / Comprador / Vendedor / Mirón, sacamos
   `ADMIN` de los comercios y el encargado es otro `OWNER` (el esquema hoy
   permite un solo dueño “de hecho”, no de restricción).
2. **¿El comprador confirma siempre, o el dueño se lo habilita?** Yo: el rol
   ya es el permiso. Menos palancas, menos bugs.
3. **¿El dueño invita gente desde la app?** Yo: sí, es lo que cierra Tipo 1.
   Si preferís que por ahora lo siga haciendo el superadmin, T2 se posterga.
4. **¿Escondemos el Portal de Marcas al comercio hasta el Tipo 3?** Yo: sí.
5. **¿Carrito personal o compartido en el local?** Yo: personal. El pedido
   aprobado es del local.

---

## 7. Borrador de visión — Tipo 2 (Distribuidor)

No se implementa ahora. Está para que lo mires y me corrijas de a poco.

Un distribuidor (New Bytes, Elit) entra a NODO y ve **sus comercios**, no el
catálogo para comprar. NODO para ellos es la cartera:

- Gerente (`OWNER`): equipo interno, códigos de vinculación (y más adelante
  QR), política de descuento por comercio, publicidad, asignar vendedor a
  cada cliente.
- Vendedor (`SELLER`): **solo sus clientes**. Resumen de pedidos de cada
  uno, contacto, y más adelante un descuento puntual con tope. No ve al
  comercio que atiende otro compañero.
- Product Manager: más adelante, y **solo** sobre las marcas de su alcance,
  dentro de su empresa. No es un vendedor.

El descuento del vínculo, que hoy es un número muerto, nace acá: el gerente
o el vendedor lo carga, y el comercio lo ve reflejado en el precio. Por eso
no lo pongo en el cierre del Tipo 1.

Lo que un distribuidor **no** hace en NODO: cargar la cuenta API del
comercio. Esa cuenta es del local. El distribuidor le da el código o le
abre la cuenta en *su* portal; el comercio la pega en NODO.

---

## 8. Borrador de visión — Tipo 3 (Marca)

Tampoco se implementa ahora. El módulo actual de Marcas se reconstruye; no
se le sigue agregando.

Una marca (Asus, Gigabyte) no vende por NODO. Opera **sobre** comercios y
distribuidores que ya existen:

- Ve solo a quienes la vincularon (código o publicidad). El resto no existe.
- Elige un distribuidor y un comercio y lanza una acción (descuento, objetivo
  de compra, material). NODO lo contabiliza.
- El comercio, cuando Tipo 3 exista, ve esa marca en su mundo. Hasta entonces
  no hay un segundo catálogo de marcas compitiendo con los proveedores.

Marketing y Comercial son roles internos de la marca, no del comercio.

---

## 9. Qué no tocaríamos mientras cerramos Tipo 1

Para no pisarnos:

- Adapters de proveedor y el research de APIs nuevas.
- El módulo de Marcas (`app/marca`, `app/marcas`, `lib/brands`).
- Visual de búsqueda, ficha, home, tema. Salvo esconder ítems de menú y el
  vacío con canje.
- Panel del distribuidor: no empieza hasta que Tipo 1 esté cerrado y lo
  hablemos.

Sí se toca: `apps/api` (roles, `/cart` usado de verdad, `/my/team`),
`apps/web` carrito / pedidos / proveedores / configuración, y estos docs.
