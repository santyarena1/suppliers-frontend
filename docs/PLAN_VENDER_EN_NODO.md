# Vender en NODO — plan

Un comercio (tipo 1) publica parte de su stock y los otros comercios de NODO lo
encuentran en el buscador como un proveedor más ("The Gamer Shop" al lado de
Air o Invid). No es un distribuidor: es un **local que vende**. Distribuidor y
Marca siguen siendo organizaciones aparte, que se piden y aprueba NODO.

## Decisiones tomadas

- Le venden **locales a locales**, dentro de NODO. Nada de consumidor final ni cobros: el pago lo arreglan entre ellos.
- Entra en **Pro** (y Custom): capacidad `storefront`.
- **Todos los comercios** ven las publicaciones de todos los locales (menos las propias).
- En el buscador, cada local es una opción más del filtro **Distribuidor**, marcada como local.
- En **Configuración → Búsqueda**: "Incluir lo que publican otros locales" (prendido por defecto). Apagado, los locales no entran en la búsqueda inicial pero siguen en el filtro para elegirlos a mano.
- **El stock vence a los 3 días** sin confirmar: la tienda deja de verse hasta que el dueño confirma ("Mi stock está al día") o sube una planilla nueva. NODO le avisa un día antes. Editar un producto suelto no confirma el resto.
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
