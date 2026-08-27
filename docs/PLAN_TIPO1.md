# Cerrar el Tipo 1 — Comercio

Visión **acordada** con las correcciones de agosto 2026. Lo que sigue es lo
que se implementa; si algo nuevo no cierra, se discute acá antes de
codificarlo.

El aislamiento (fases 0–5 de `docs/PLAN_AISLAMIENTO.md`) ya está desplegado.
Esto cubre lo que le falta al **comercio** para operar solo. Distribuidores y
marcas vienen después; al final hay un borrador para seguir discutiendo.

Hasta que no esté todo y cambie el dominio, **producción es el entorno de
prueba real** (otras plataformas, otros dispositivos). No escondemos
pantallas “porque todavía es desarrollo”.

---

## 1. Cómo es un comercio en NODO

Un comercio es un local que **compra** a distribuidores. NODO no es su
sistema de venta al público: es donde el equipo ve stock y precio de *sus*
cuentas, arma el pedido y lo manda.

En pantalla, **nunca “dueño”**. El que manda el local es el
**Administrador**. Internamente el rol es `ADMIN`. Los `OWNER` que haya hoy
en comercios se migran a `ADMIN`. `OWNER` queda para gerentes de
distribuidor y de marca, más adelante.

| Quién en el local | En pantalla | Rol | Qué hace |
|---|---|---|---|
| Quien lleva el local | Administrador | `ADMIN` | Alta del equipo, cuentas de los mayoristas, con quién están vinculados, markup, firmar pedidos, y el tilde del comprador. |
| Encargado de compras | Comprador | `BUYER` | Busca y llena el carrito. Si el administrador le dio vía libre, confirma solo. Si no, el pedido queda esperando firma. |
| Vendedor de mostrador | Vendedor | `SELLER` | Busca y arma el carrito. **Nunca** manda el pedido: siempre espera al administrador. |
| Contador, socio, consulta | Solo lectura | `VIEWER` | Ve catálogo, precios, pedidos y con quién está el local. No toca carrito, cuentas ni gente. |

Si el comercio tiene **una sola persona**, esa persona es administrador y
confirma directo. No hay flujo de aprobación vacío.

El carrito es **uno por local**, no por persona: lo ve y lo toca cualquiera
del equipo que pueda pedir, en la computadora o en el celular. Persiste en
la API.

Lo que el comercio **no** es: un CRM de clientes finales, ni un lugar para
descubrir todos los mayoristas del país, ni quien define descuentos de
cuenta (eso es del distribuidor).

Nada de slugs ni texto en inglés en la interfaz. Nombres normalizados.

---

## 2. El día a día (Tipo 1 cerrado)

1. Alguien da de alta el comercio: nombre del local, su usuario, su mail.
   Queda creado el comercio y esa persona como administrador. Entra y
   trabaja. El superadmin lo ve en el árbol; no es el que lo tiene que
   cargar a mano.
2. En Configuración ve el local: nombre, equipo, a quién está vinculado
   (cada distribuidor con el vendedor de contacto, si hay), y el tilde del
   comprador.
3. Invita vendedores y compradores desde **Equipo**. Contraseña generada,
   se muestra una sola vez. Nombres de rol en español.
4. En Proveedores aparecen solo los que tiene. Canjea un código escrito; en
   el celular puede escanear el QR que le mandó el mayorista. En
   escritorio no hace falta cámara: se tipea el código.
5. Carga usuario y contraseña del portal **una vez**. Las ve todo el
   equipo, porque la cuenta es del local. Solo el administrador las carga
   o las borra.
6. El markup y el umbral de stock los pone el administrador. Se ven al
   toque. El catálogo se refresca solo, en el intervalo que ya está
   configurado: **nadie ve ni entiende un “hay que resincronizar”**.
7. El vendedor agrega al carrito compartido. Confirma, y ve “quedó
   esperando al administrador”. El administrador entra a Pedidos y firma o
   rechaza. Recién ahí sale al mayorista.
8. El comprador usa el mismo carrito. Si tiene vía libre, el botón dice
   “Confirmar pedido” y sale. Si no, igual que el vendedor.

---

## 3. El tilde del comprador, en criollo

Hay dos personas que arman pedidos y no son el administrador:

- El **vendedor** está en el mostrador. Nunca tiene que mandar un pedido al
  mayorista: se puede equivocar de cantidad o de cliente. Siempre firma el
  administrador.
- El **comprador** es el encargado de compras. En un local chico, el
  administrador le confía que mande solo. En uno más controlado, quiere
  mirar igual que con el vendedor.

Eso no es un rol distinto: es **un tilde en Configuración del local**, que
solo ve el administrador:

- Apagado (por defecto): el comprador arma y el pedido espera firma.
- Encendido (“El comprador puede confirmar pedidos”): el comprador manda
  directo, como el administrador.

El vendedor no tiene tilde. Nunca confirma.

---

## 4. Qué ya está (no rehacer)

- Organización en la sesión.
- Credenciales y config de sync por comercio.
- Precio y stock por comercio; markup al leer.
- Búsqueda cerrada + canje de código escrito.
- Pedidos de la organización, con retención si el rol no confirma.
- Árbol de superadmin, “Entrar como”, contraseñas generadas.
- Vendedor asignado visible en el dashboard de proveedores.

---

## 5. Qué se implementa

### 5.1 Panel de configuración y administración del local

Hoy Configuración es tema, moneda e IVA. Pasa a ser **el panel del
administrador del local**: simple, en español, sin claves internas.

Solapas (nombres de pantalla, no de código):

1. **Local** — nombre del comercio (editable), datos de contacto.
2. **Equipo** — quién está, rol, activo o no, invitar, cambiar rol,
   desactivar. Contraseña de una sola vez al crear.
3. **Pedidos** — el tilde del comprador.
4. **Proveedores vinculados** — lista con nombre normalizado, si hay
   cuenta cargada, y el vendedor de contacto (nombre y mail) cuando el
   distribuidor lo haya asignado. Desde acá también canjear un código.
5. **Preferencias** — lo que ya está (apariencia, moneda, IVA).

Un `VIEWER` puede mirar Local y Proveedores vinculados. No ve Equipo ni el
tilde. Un vendedor/comprador ve lo mismo más preferencias personales. Solo
el administrador edita.

### 5.2 Alta de comercio

Formulario público que **funciona de punta a punta**:

- Nombre del local
- Nombre de usuario y mail del administrador
- Contraseña (o se genera y se muestra una vez)

Crea la organización `RETAILER`, el usuario y la membresía `ADMIN`. Entra
directo a NODO. El superadmin lo ve en el árbol, no lo tiene que sembrar.

Sin slugs. El nombre del local es el que se muestra. Si choca con otro, se
pide otro nombre, en castellano.

El registro actual que crea un usuario suelto sin organización deja de ser
el camino: o se convierte en esta alta, o se retira.

### 5.3 Roles en la cara y en la API

| Acción | Administrador | Comprador | Vendedor | Solo lectura |
|---|---|---|---|---|
| Buscar / ver ficha | sí | sí | sí | sí |
| Ver con quién está vinculado | sí | sí | sí | sí |
| Usar el carrito compartido | sí | sí | sí | no |
| Confirmar pedido | sí | según tilde | no (espera firma) | no |
| Aprobar / rechazar | sí | no | no | no |
| Cargar credenciales y markup | sí | no | no | no |
| Sincronizar a mano | sí | no | no | no |
| Canjear código / escanear QR | sí | no | no | no |
| Invitar y gestionar equipo | sí | no | no | no |
| Alta de comercio | — (ya está adentro) | — | — | — |

Los botones que no corresponden **no están**. No “dan error después”.

Los `OWNER` de comercios existentes pasan a `ADMIN`. En pantalla, si
quedara alguno, se muestra “Administrador”, nunca “Dueño”.

### 5.4 Equipo

El administrador invita a su gente. Eso es la gestión de equipo.

- Roles al invitar: Comprador, Vendedor, Solo lectura, Administrador.
- No se puede dejar el local sin ningún administrador.
- Desactivar, no borrar: queda quién armó cada pedido.
- Textos en español. Nada de `BUYER`, `SELLER`, `username` a la vista
  (puede decir “usuario” si hace falta).

El superadmin sigue pudiendo hacerlo desde el árbol, como red de seguridad.

### 5.5 Carrito compartido y persistente

Un solo carrito por comercio, en la API.

- Lo ven juntos administrador, comprador y vendedor, en cualquier
  dispositivo.
- Si uno agrega un teclado en el celular, aparece en la caja.
- `VIEWER` no lo muta; si pide `/cart` puede verlo o no — propuesta: lo
  ve en lectura, no agrega ni saca.
- El superadmin de prueba comparte el carrito del Comercio de Pruebas.
- La web deja `localStorage`. Se hidrata de `GET /cart`.

Cambio de esquema: la clave deja de ser persona+comercio+producto y pasa a
ser comercio+producto.

### 5.6 Credenciales y markup solo del administrador

Un vendedor no “prueba” la clave de Elit. La API y la UI lo impiden.

### 5.7 Catálogo que se actualiza solo (sin `needsResync` a la vista)

`needsResync` nació porque los precios viejos tenían el markup metido
adentro y no había forma de sacar el número crudo. **No es una tarea del
local.**

Qué hacemos:

- Si el comercio tiene cuenta en un proveedor, la sincronización automática
  queda **prendida**. El cron que ya corre cada tanto es el que limpia esos
  precios, no un aviso en pantalla.
- En cuanto una sync termina bien, el flag interno se apaga. Nadie lo ve.
- No hay texto, badge ni pantalla de “hay que resincronizar”.

Si el cron no está tomando a alguien que sí tiene cuenta, eso es un bug
nuestro, no un flujo del usuario.

### 5.8 Código escrito y QR en el celular

- Escritorio: se tipea el código. Cámara no hace falta.
- Celular: el mismo canje, más **escanear** el QR que le mandó el
  mayorista (la cámara del navegador). El QR lo **genera el distribuidor**
  (Tipo 2); el comercio solo lo lee.

### 5.9 Portal de Marcas

Se **deja**. Hasta que no esté todo y cambie el dominio, producción se usa
para probar también ese módulo.

### 5.10 Lo que no entra en Tipo 1

- **Descuento del vínculo.** Se saca de la experiencia del comercio. No se
  muestra, no se edita, no se aplica acá. Es del distribuidor (Tipo 2). El
  campo puede quedar en la base para cuando exista ese panel; el comercio
  no lo ve.
- **Chat.** Importante, pero nace con el Tipo 2 y **ahí** aparece también
  para el comercio. No se arma ahora “del lado del local”.
- Generar QR (eso lo hace el mayorista).

---

## 6. Tandas de implementación

Cada tanda se prueba en el entorno real (el que hoy es producción) con
“Entrar como”, y también en un celular. Los comercios de prueba del árbol
sirven; `testuser1` también, porque ese entorno es de prueba.

| Tanda | Qué | Listo cuando… |
|---|---|---|
| **T1 — Panel del local + roles** | Configuración con Local / Equipo / Pedidos (tilde) / Vinculados. API y UI respetan la tabla de roles. `OWNER` de comercios → `ADMIN`. | El administrador invita un vendedor. El vendedor no ve cuentas ni confirma. El tilde cambia lo que puede hacer el comprador. |
| **T2 — Alta de comercio** | El formulario crea local + administrador y entra. | Me registro como un local nuevo y en 1 minuto estoy dentro, con Equipo vacío y sin proveedores, listo para canjear un código. |
| **T3 — Carrito compartido en la API** | Un carrito por local, web y móvil iguales. | Agrego en un browser, lo veo en otro usuario del mismo local. Un mirón no saca nada. |
| **T4 — Sync solo y canje móvil** | Cuentas con sync automática; `needsResync` invisible. Canje por código y por cámara en el celular. | Nadie ve “resincronizar”. Desde el teléfono se puede pegar o escanear un código. |

T1 y T2 se pueden solapar un poco (el alta necesita el panel). T3 no se
mezcla: cambia cómo se guarda el carrito.

---

## 7. Tipo 2 (Distribuidor)

Cerrado en `docs/PLAN_TIPO2.md`.

---

## 8. Borrador — Tipo 3 (Marca)

Tampoco ahora. El módulo actual se reconstruye; no se le sigue agregando
lógica nueva de aislamiento.

La marca no vende por NODO. Opera sobre comercios y distribuidores que ya
la vincularon. El Portal de Marcas que hoy ve el comercio se deja como está
hasta ese momento, porque se usa para probar.

---

## 9. Qué no tocaríamos mientras cerramos Tipo 1

- Adapters de proveedor y research de APIs nuevas.
- Lógica nueva del módulo de Marcas (se puede *usar* para probar; no se
  reescribe).
- Visual de búsqueda / ficha / home, salvo lo que el panel y los roles
  obliguen (botones, vacíos, canje).
- Panel del distribuidor (Tipo 2), generación de QR del mayorista.

Sí se toca: `apps/api` (roles de comercio, alta, `/my/*`, carrito por
organización, sync automática), `apps/web` configuración / carrito /
pedidos / proveedores / registro, y estos docs.
