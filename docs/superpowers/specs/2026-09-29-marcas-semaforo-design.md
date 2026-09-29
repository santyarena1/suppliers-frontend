# Marcas: productos, semáforo y link público

Estado: diseño (2026-09-29). Reemplaza el semáforo por SKU suelto de `BrandSkuSignal`
(ver `docs/PLAN_TIPO3.md`). Primera etapa del plan de marcas.

## Problema

Hoy las marcas mandan cada tanto un PDF o un texto con un semáforo de stock por
distribuidor y, a veces, un precio de referencia. Llega viejo, no se puede filtrar y
no conecta con la compra. En NODO la marca marca cada código de cada distribuidor por
separado: no existe "mi producto" agrupando sus códigos en todos los distros.

## Decisiones (del dueño del producto)

- La marca elige el **modo**: semáforo **automático** (sale del stock real sincronizado
  de cada distribuidor con rangos que define la marca) o **manual** (marca las luces).
- La marca elige si ella ve el **stock exacto** o solo el **rango**. Comercios y el link
  público ven siempre el rango.
- Todo lo de la marca (semáforo, landing, lanzamientos…) se puede ver con un **link
  público** compartible, también por gente que no usa NODO. Dentro de NODO se suma la
  integración: sus distribuidores, comprar, estadísticas.
- Lo ven solo **vinculados** dentro de NODO o **quien recibió el link**. El link sirve
  además para **vincular** un comercio con la marca.
- La landing elaborada de cada marca la arma el equipo de NODO a pedido; la marca
  gestiona sus datos y su identidad (logo, colores, portada).

## Modelo

```
BrandItem           (producto de la marca)
  tenantId (marca), name, partNumber?, ean?, imageUrl?,
  referencePrice?, currency, manualState? (INCOMING | DISCONTINUED),
  incomingAt?, notes?, position, active

BrandItemLink       (ese producto en un distribuidor)
  brandItemId, provider, externalId, manualLevel? (NONE|LOW|MEDIUM|HIGH)
  @@unique(brandItemId, provider, externalId)

BrandStockSettings  (1 por marca)
  tenantId, mode (AUTO | MANUAL), lowBelow (def. 5), highFrom (def. 20),
  brandSeesExact (def. false), publicStock (def. true)
```

`BrandSkuSignal` se migra: cada señal pasa a un `BrandItem` con un link (su luz
manual → `manualLevel`, precio sugerido → `referencePrice`). Después se retira.

## Semáforo

Niveles: **Sin stock · Bajo · Medio · Alto**, más **Próximo ingreso** y
**Discontinuado** (estado manual del producto, pisa todo) y **Sin dato** (el distribuidor
no sincronizó en 48 h).

- **Automático:** stock del distribuidor = el de la oferta más reciente de ese
  `(provider, externalId)` entre todas las sincronizaciones (el stock de un distro es el
  mismo para cualquier comercio). `0 → Sin stock`, `< lowBelow → Bajo`,
  `>= highFrom → Alto`, resto `Medio`.
- **Manual:** `manualLevel` de cada link.
- La función que calcula el nivel es pura y tiene tests.

## Armar los productos (panel de la marca, `/marca/productos`)

1. NODO detecta los códigos de la marca en todos los distribuidores (por nombre de
   marca, como hoy) y los **agrupa solos por EAN o part number**: "Mouse X está en
   Elit, Air y Invid".
2. La marca acepta los grupos sugeridos (uno o todos) y quedan como sus productos.
3. Puede sumar o sacar códigos de un producto, cargar precio de referencia, estado
   (próximo ingreso / discontinuado) y, en manual, las luces.
4. Configuración: modo, rangos, si ve stock exacto, si el link público muestra stock.

## Dónde se ve

| Lugar | Qué ve |
|---|---|
| Marca (`/marca/productos`) | Sus productos × distribuidores, con rango o stock exacto según su elección. |
| Comercio vinculado (`/marcas/:linkId`) | Productos × distribuidores en rango, primero **sus** distribuidores; precio de referencia; botón a buscar y comprar. |
| Distribuidor vinculado | Lo mismo, sin comprar. |
| Link público (`/m/:publicKey`) | Productos × distribuidores en rango (si `publicStock`), precio de referencia, identidad. Botón "Vincular con NODO". |

## Link público como vinculación

`/m/:publicKey` muestra "Vincular con NODO". Con sesión de comercio crea el vínculo
comercio↔marca (como canjear un código). Sin sesión, pasa por login/alta y vuelve.

## Etapas siguientes (fuera de esta)

2. Lanzamientos (fecha, fotos, materiales) y acciones/eventos/avisos en el mismo espacio.
3. Estadísticas: del comercio con cada marca (cuánto, dónde, qué, ranking) y de la marca
   (presencia, demanda agregada y anónima).
4. Retiro del portal viejo (`BrandAccount` y cía., `admin/marcas/*`, páginas redirect).
