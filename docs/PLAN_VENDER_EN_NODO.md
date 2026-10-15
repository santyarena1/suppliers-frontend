# Vender en NODO — plan

Un comercio (tipo 1) publica parte de su stock y los otros comercios de NODO lo
encuentran en el buscador como un proveedor más ("The Gamer Shop" al lado de
Air o Invid). No es un distribuidor: es un **local que vende**. Distribuidor y
Marca siguen siendo organizaciones aparte, que se piden y aprueba NODO.

## Decisiones tomadas

- Le venden **locales a locales**, dentro de NODO. Nada de consumidor final ni cobros: el pago lo arreglan entre ellos.
- Entra en **Pro** (y Custom): capacidad `storefront`.
- **Cada comercio elige** qué tiendas ve: a cada uno se le pregunta "X está vendiendo en NODO, ¿querés ver sus productos?" (aviso, tarjeta en Inicio y Búsqueda) y lo cambia cuando quiera en **Configuración → Tiendas de locales**. Una tienda **privada** no se ofrece: entra quien abre su **link de invitación** (`/tienda/<token>`, regenerable). La tienda ve quiénes la ven y puede sacar a alguien.
- En el buscador, cada local es una opción más del filtro **Distribuidor**, marcada como local.
- En **Configuración → Búsqueda**: "Incluir lo que publican otros locales" (prendido por defecto). Apagado, los locales no entran en la búsqueda inicial pero siguen en el filtro para elegirlos a mano.
- **Stock: lo configura el dueño.** Cada cuántos días se le pide confirmarlo (1, 2, 3, 7, 15, 30 o nunca; por defecto 3) y qué pasa si no lo hace: **seguir visible** avisándole al comprador que no está confirmado (por defecto) u **ocultarse**. Recordatorio en NODO, por mail y en una barra arriba de toda la app; vencido, se repite cada tantos días como la vigencia durante un mes. Subir una planilla o "Mi stock está al día" lo confirma; publicar el primer producto también.
- **Perfil público:** nombre propio (no puede ser el de otra organización ni un distribuidor), logo (es el logo del proveedor en todo NODO), presentación, formas de pago, entrega, facturación, garantía general, condiciones, "también vendo por fuera de NODO" y un **mail para recibir los pedidos**.
- **Ficha del producto:** hasta 8 fotos (se achican en el navegador a ~1200 px WebP, sin EXIF, y se guardan como `/assets/<id>`), descripción, garantía propia y estado (nuevo, caja abierta, reacondicionado, usado). Marca y categoría se eligen de las vigentes o se crean.
- **Cerrar y reabrir** cuando quiera (los pedidos pendientes se rechazan avisando); opcionalmente borrando productos y fotos.
- **Google Sheets:** la tienda conecta una planilla compartida como lector; NODO la lee cada 15 min (o "Sincronizar ahora") y, si cambió, entra por el importador de listas. Columnas extra "Estado" y "Fotos" (varios links). NODO arma la URL de exportación, solo sigue redirecciones a Google y solo acepta CSV.
- Lo que tiene **stock 0 no se muestra** a los compradores (al vincularse, su configuración de esa tienda queda en ocultar sin stock).
- **Todo pedido es "a confirmar"**: el vendedor lo confirma o lo rechaza. Confirmar descuenta el stock publicado.
- La conexión con el sistema de gestión queda como **Próximamente**.
- En el módulo siempre está a la vista: "¿Querés cartera de clientes, vendedores, descuentos por cliente y publicidad? **Convertite en Distribuidor**" y "¿Tenés marca propia? **Convertite en Marca**". Es una solicitud que revisa NODO.

## Cómo se arma por dentro (reusa lo que ya existe)

Una tienda es un **proveedor por lista** (`Tenant` DISTRIBUTOR con `providerKey` `LIST_*`) que **pertenece** a un comercio:

```
Tenant RETAILER (The Gamer Shop) ──Storefront──▶ Tenant DISTRIBUTOR LIST_THE_GAMER_SHOP (sin miembros)
                                                    │
                       TenantLink LIST_CONNECTED ───┘──▶ cada comercio activo (menos el dueño)
```

- `Storefront` (modelo nuevo): `retailerTenantId` (único), `supplierTenantId` (único), `status` `ACTIVE | PAUSED | SUSPENDED` (SUSPENDED = lo frenó NODO), `stockConfirmedAt`, `stockValidDays` (3), `contactPhone`, `contactNote` (zona, retiro, horarios).
- El dueño maneja la tienda **desde su propio local** (una persona = una organización; no hay selector). `resolveAccess` de listas reconoce al dueño de la tienda como la organización proveedora → sube la **lista base**.
- Visibilidad: un vínculo `LIST_CONNECTED` con cada comercio activo. Con eso la lista base se materializa en cada comercio como cualquier proveedor por lista (búsqueda, fichas, carrito, marcas, categorías: sin tocar). Los vínculos los crea `StorefrontService.syncLinks` al activar, al subir lista y cada 15 min (comercios nuevos).
- `listFor` marca esas filas `storefront: true`, las saca si la tienda no está `ACTIVE` o el stock venció, y **no** cuentan para el tope del plan. No aparecen en: Proveedores, "Tus proveedores" del inicio, sidebar de proveedores, directorio de "Agregar proveedor", ni en la **API de catálogo** del comprador (no se reexporta el stock de otro local).
- Un comprador puede sacar una tienda de su búsqueda o desconectarse (`DELETE /my/providers/:p`): el vínculo queda `REVOKED` y la sincronización no lo vuelve a crear.
- Solo el dueño sube la lista de su tienda. Un comprador no le carga precios propios (403); sí lee las fechas de la lista (`/freshness`), que usa el buscador.
- Superadmin: la tienda aparece en la configuración de proveedores (logo, color, ocultar) como cualquier lista, y puede suspenderla.

## Catálogo

- **Excel**: el mismo importador de listas (perfil de columnas con sugerencia por IA, revisión, revertir). La planilla es una foto completa: lo que no viene se despublica. Columnas: código, nombre, marca, categoría, precio, moneda, stock, EAN, part number.
- **Carga manual**: alta de un producto (nombre, marca, categoría, código, precio, moneda, IVA, stock) y edición rápida de precio/stock/pausa desde la tabla. Avisa que una planilla nueva reemplaza todo.
- **Marcas propias**: la marca de la planilla o del alta manual entra tal cual al filtro de marcas. Las que NODO no conoce se muestran como "nueva en NODO"; las conocidas se unifican solas (`autoAssignKnownBrands`).

## Pedidos

1. El comprador arma el carrito como siempre. En la pestaña de la tienda: **"Enviar pedido a The Gamer Shop"** (crea un pedido offline, `storefrontStatus = PENDING`). Si el comprador necesita aprobación interna, la tienda lo ve recién cuando se aprueba.
2. La tienda recibe un aviso y lo ve en **Vender → Pedidos** con los datos de contacto del comprador.
3. **Confirmar** (descuenta stock) o **Rechazar** con motivo. El comprador recibe el aviso y lo ve en Pedidos.
4. Contacto directo por WhatsApp/teléfono de cada lado.

## Solicitud para ser Distribuidor o Marca

Entra a la bandeja **Solicitudes** del superadmin como `SUPPLIER_JOIN` (con aviso por mail), con `Origen: Vender en NODO` y `Tipo: Distribuidor | Marca`. Una pendiente por tipo (pedirla de nuevo actualiza el mensaje). El comercio ve si está pendiente o atendida. NODO crea la organización tipo 2/3 a mano como hoy.

## Pantallas

- Sidebar (comercio, dueño/administrador): **Vender en NODO**.
- `/vender`: sin tienda → explicación + "Abrir mi tienda". Con tienda → Resumen (estado, stock confirmado hace X, Confirmar stock, pausar), Productos (tabla, alta manual, subir Excel), Pedidos, Datos de la tienda. Siempre: bloque "Convertite en Distribuidor / Marca" y "Próximamente: conexión con tu sistema de gestión".
- Buscador: los locales en el filtro Distribuidor; ficha y tarjetas con etiqueta **Local**.
- Configuración → Búsqueda: el interruptor de locales.

## Seguridad / producción

- Migración solo aditiva (tablas y columnas nuevas, nullables).
- Nada cambia para nadie hasta que un comercio abre su tienda.
- Tests unitarios de cada regla + simulación de punta a punta contra una base local: abrir tienda, subir lista, que otro local la vea y compre, confirmar/rechazar, vencimiento de stock, que un tercero no pueda tocar la tienda ni los pedidos ajenos.

## Verificación

- `apps/api/src/storefront/storefront-rules.spec.ts` (vigencia, motivos, avisos, stock) y `list-import.service.spec.ts` (acceso de dueño y de terceros).
- Simulación de punta a punta contra el API local: `SIM_ONLY=storefront node test-e2e-sim/run.mjs` (V1–V9: abrir, publicar por planilla y a mano, pedidos con confirmación, rechazo y cancelación, aprobación interna, vencimiento/pausa/moderación, comercios nuevos y desconexión, solicitudes, entradas inválidas). La corrida completa da las mismas fallas previas que sin este cambio.

## Para el comprador: «Tiendas de locales» en Proveedores (2026-10-16)

- En `/proveedores` hay una sección "Tiendas de locales" con las tiendas que el
  comercio acepta, las que esperan respuesta y (plegadas) las que no quiso ver.
- Cada tienda tiene su ficha en `/proveedores/<LIST_…>`: Productos, La tienda
  (condiciones, contacto, dejar de verla) y Márgenes de venta, igual que un
  distribuidor y con margen **por estado** (nuevo, caja abierta,
  reacondicionado, usado).

## Fotos de internet (2026-10-16)

- En la ficha del producto, «Buscar en internet» busca con Serper (como la
  «Primera foto»), con tope de 25 búsquedas por tienda y por día. El servidor
  no baja nada: la web baja la elegida por `/img-proxy`, la achica a WebP y la
  sube como una foto propia de la tienda.
- La foto que NODO le encontró sola a un producto se marca «NODO» y se puede
  conservar al editar (antes daba "Alguna foto no es de tu tienda").
