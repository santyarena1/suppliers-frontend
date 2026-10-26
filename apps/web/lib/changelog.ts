/**
 * Qué hay de nuevo en NODO, para los comercios. Cada cambio que ven los
 * usuarios suma una entrada ARRIBA de todo y sube APP_VERSION:
 * - nueva función → sube el segundo número (2.7.0 → 2.8.0)
 * - solo arreglos o ajustes → sube el tercero (2.7.0 → 2.7.1)
 * El modal "Qué hay de nuevo" se abre una vez por versión nueva.
 * Solo lo que el comercio nota: nada de cambios internos ni del superadmin.
 */

export type ChangeKind = "new" | "improved" | "fixed";

export interface ChangelogEntry {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  /** Lo más importante de la versión, en una línea. */
  title: string;
  changes: { kind: ChangeKind; text: string }[];
}

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  new: "Nuevo",
  improved: "Mejora",
  fixed: "Arreglo",
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2.15.1",
    date: "2026-10-26",
    title: "Los distribuidores pausados en NODO no aparecen en ningún lado",
    changes: [
      { kind: "fixed", text: "Un distribuidor que NODO tiene pausado ya no aparece para conectarse, ni en «Mismo producto en otros distribuidores», noticias, publicidad, chat, el mapa de las marcas ni las tiendas de otros locales." },
    ],
  },
  {
    version: "2.15.0",
    date: "2026-10-26",
    title: "Air: elegí de qué depósito ves el stock",
    changes: [
      { kind: "new", text: "En Configuración de Air elegís qué depósitos ves (Lugano, Rosario, Córdoba, Mendoza). El stock es solo el de esos depósitos, ya descontado lo reservado, y se actualiza al guardar." },
      { kind: "fixed", text: "Air: un depósito con más unidades reservadas que físicas ya no le resta stock a los demás." },
      { kind: "fixed", text: "New Bytes: el stock es el mismo que muestra su sitio. Antes NODO mostraba menos unidades, y cuando New Bytes dice «10 o más» ahora se ve así." },
      { kind: "fixed", text: "New Bytes: lo que NODO había cargado en una cotización anterior ya no aparece como «cargado en New Bytes» al volver al carrito. Solo se avisa lo que agregaste o cambiaste en el portal." },
    ],
  },
  {
    version: "2.14.2",
    date: "2026-10-26",
    title: "Presupuestos: el total coincide en pantalla, PDF y WhatsApp",
    changes: [
      { kind: "fixed", text: "Si agregás varios productos al mismo presupuesto muy rápido (o desde dos pestañas), ya no se pierde ninguno." },
      { kind: "fixed", text: "El total del presupuesto en pesos es el mismo en la pantalla, el PDF, el mensaje de WhatsApp y la lista." },
      { kind: "fixed", text: "Los teléfonos escritos como 011 15-… o +54 sin el 9 abren bien el WhatsApp desde presupuestos, tiendas y la bandeja." },
      { kind: "fixed", text: "En las planillas de tu tienda, la moneda escrita como U$S, $ o Pesos se reconoce bien." },
    ],
  },
  {
    version: "2.14.1",
    date: "2026-10-24",
    title: "Elit: notas de venta separadas entre NODO y el portal",
    changes: [
      { kind: "improved", text: "En Pedidos de Elit, las notas de venta se filtran por origen: las que confirmaste desde el carrito de NODO (con la marca NODO) y las que hiciste directo en elit.com.ar." },
      { kind: "fixed", text: "Masnet: si su servidor corta o tarda, la actualización de precios reintenta sola antes de marcar error." },
    ],
  },
  {
    version: "2.14.0",
    date: "2026-10-24",
    title: "Proveedores: resumen de cada distribuidor y catálogo con filtros",
    changes: [
      { kind: "new", text: "Proveedores muestra arriba cuántos distribuidores están al día, cuántos productos tenés con stock, cuánto compraste en 90 días y a quién le comprás más." },
      { kind: "new", text: "Cada distribuidor abre en Resumen: tu cuenta, cómo le comprás, los últimos pedidos desde NODO y cómo salieron las actualizaciones de las últimas 48 horas." },
      { kind: "improved", text: "Arriba de cada distribuidor: su estado, de cuándo son los precios, y los botones para hablar con el vendedor, abrir el portal y actualizar precios." },
      { kind: "improved", text: "El catálogo de cada distribuidor se filtra por categoría y marca, se ordena por precio o stock, tiene paginado y un botón para mandar al carrito." },
      { kind: "improved", text: "Actualizaciones: todas, con productos nuevos o con error, con paginado para ver las anteriores." },
    ],
  },
  {
    version: "2.13.1",
    date: "2026-10-23",
    title: "Armador de PC: filtros encadenados y fuente certificada",
    changes: [
      { kind: "improved", text: "Filtros a la izquierda que se encadenan: si elegís AMD, en Socket quedan AM4 y AM5. Hay filtros por categoría sacados de la ficha: línea, video integrado, X3D, serie G o F, cooler incluido, núcleos, chipset, formato, WiFi, capacidad, frecuencia, certificación, largo de placa y más." },
      { kind: "improved", text: "Con placa de video dedicada solo se ofrecen fuentes certificadas (80 Plus o superior)." },
      { kind: "improved", text: "Cuando a una ficha le falta un dato, el aviso dice a qué producto y qué dato le falta, y lo que sí se sabe (por ejemplo, hasta cuántos mm admite el gabinete)." },
    ],
  },
  {
    version: "2.13.0",
    date: "2026-10-23",
    title: "Armador de PC en Presupuestos",
    changes: [
      { kind: "new", text: "Presupuestos → Armar PC: elegís paso a paso procesador, mother, memoria, placa de video, disco, fuente, gabinete y refrigeración. En cada paso ves solo lo compatible con lo que ya elegiste (socket, memoria, formato, largo de la placa, altura del cooler, potencia), con foto, datos clave y el precio de cada distribuidor." },
      { kind: "new", text: "En cada pieza ves los distribuidores que la tienen con su logo, stock y precio, y la cambiás con un clic. A la derecha, la compra por distribuidor y todos los chequeos de compatibilidad." },
      { kind: "new", text: "Sumás cualquier producto del catálogo (monitor, teclado, mouse…) y líneas libres como el armado. Al final elegís de qué distribuidor sale cada pieza (más barato o menos distribuidores) y lo pasás a un presupuesto o al carrito." },
    ],
  },
  {
    version: "2.12.1",
    date: "2026-10-23",
    title: "Carrito más compacto",
    changes: [
      { kind: "improved", text: "Cada producto del carrito muestra la foto a la altura de toda la línea, y la marca, el código, quién lo agregó y los botones de offline y esquema van en una sola fila." },
    ],
  },
  {
    version: "2.12.0",
    date: "2026-10-22",
    title: "Masnet, Microglobal y PC Arts, y Solution Box por su API",
    changes: [
      { kind: "new", text: "Nuevos distribuidores: Masnet, Microglobal y PC Arts. Cargá tu cuenta en Proveedores y NODO trae su catálogo con precio neto, IVA, impuestos internos y stock, actualizado como mucho cada 2 horas. Los pedidos se siguen haciendo en el portal de cada uno." },
      { kind: "new", text: "Solution Box: si te dieron usuario y contraseña de su API, cargalos en Configuración → Cuenta. El catálogo sale de la API, con los impuestos internos, y se puede actualizar cada 1 hora en vez de cada 12. Pedidos y facturas siguen con el mail y la contraseña del sitio." },
      { kind: "new", text: "Air: los productos van sumando foto, descripción y garantía de la ficha del portal, de a tandas en cada actualización." },
      { kind: "fixed", text: "Air: los monitores importados muestran los impuestos internos (10,5 %) aparte del IVA; el neto ya no los trae adentro y el IVA no se calcula sobre ellos." },
      { kind: "fixed", text: "Polytech: si el portal pide esperar, la actualización espera y reintenta en vez de cortarse." },
    ],
  },
  {
    version: "2.11.1",
    date: "2026-10-22",
    title: "Una 5060 Ti ya no pasa por una 5060",
    changes: [
      { kind: "improved", text: "Pedidos y cuenta de Invid, New Tree y Solution Box: filtro Todas / Desde NODO / Hechas en el portal, con la marca NODO en el número. En New Bytes, en las órdenes de compra." },
      { kind: "fixed", text: "En la ficha, “Tu tienda” y los locales distinguen las variantes del mismo número: Ti, Super, XT. Una RTX 5060 ya no se compara con la 5060 Ti de tu web." },
    ],
  },
  {
    version: "2.11.0",
    date: "2026-10-22",
    title: "Proveedores renovado y toda la configuración en un solo lugar",
    changes: [
      { kind: "new", text: "Proveedores: arriba, los distribuidores que necesitan atención y qué hacer. Abajo, todos en una lista con estado, productos, cuándo se actualizó, buscador, filtros y orden." },
      { kind: "improved", text: "En cada distribuidor, Configuración junta todo: cuenta, impuestos, pago, envío, offline y esquema, actualización automática, stock, márgenes y zona de peligro, con un índice al costado." },
      { kind: "improved", text: "La pestaña de sincronización ahora se llama Actualizaciones." },
    ],
  },
  {
    version: "2.10.3",
    date: "2026-10-22",
    title: "Invid: los impuestos internos ya no se cobran dos veces",
    changes: [
      { kind: "fixed", text: "Invid: en productos con impuestos internos (monitores, por ejemplo) el IVA de la cotización traía los internos adentro y se sumaban otra vez. Ahora el IVA es el 21 % o 10,5 % que corresponde y los internos van una sola vez." },
    ],
  },
  {
    version: "2.10.2",
    date: "2026-10-22",
    title: "Carrito más claro, con los impuestos a la vista",
    changes: [
      { kind: "improved", text: "Cada producto del carrito muestra el nombre completo y, debajo, neto, IVA, internos, percepción y unitario final, también en el celular." },
      { kind: "improved", text: "Cada distribuidor cierra con su subtotal: neto, IVA, internos, percepciones, envío y total. Si el portal cobra una diferencia, figura con nombre." },
      { kind: "improved", text: "En la compu, el resumen del carrito queda a la derecha mientras recorrés los productos." },
      { kind: "improved", text: "New Bytes: las órdenes de compra se separan en las que salieron de NODO y las que se hicieron directo en el portal." },
    ],
  },
  {
    version: "2.10.1",
    date: "2026-10-22",
    title: "Locales en la ficha: el mismo producto primero",
    changes: [
      { kind: "fixed", text: "La búsqueda en locales usa la marca y el modelo completos: una Windforce ya no aparece igual que una Eagle, y otra serie del mismo chip pasa a parecidas." },
      { kind: "fixed", text: "En la ficha, los locales vuelven a separar las publicaciones del mismo producto de las parecidas, con el nombre completo de cada una. Las parecidas se abren aparte." },
    ],
  },
  {
    version: "2.10.0",
    date: "2026-10-22",
    title: "Ficha de producto renovada",
    changes: [
      { kind: "new", text: "El mismo producto en tus otros distribuidores, con su precio y stock, para elegir dónde comprar sin salir de la ficha." },
      { kind: "improved", text: "Foto más grande, los datos clave en una fila y la compra a un costado: online, offline o esquema con su precio y desglose." },
      { kind: "improved", text: "Precio, locales, descripción, especificaciones y datos del distribuidor ordenados con accesos rápidos." },
    ],
  },
  {
    version: "2.9.0",
    date: "2026-10-21",
    title: "Fichas de producto más completas",
    changes: [
      { kind: "new", text: "Miles de productos suman varias fotos, una descripción ordenada y la tabla de especificaciones." },
      { kind: "improved", text: "La misma ficha completa se ve en todos los distribuidores que venden ese producto." },
    ],
  },
  {
    version: "2.8.1",
    date: "2026-10-19",
    title: "Vender en NODO, más simple",
    changes: [
      { kind: "improved", text: "Arriba de todo ves si tu tienda se ve, qué falta y el botón para lo que sigue, en todas las pestañas." },
      { kind: "improved", text: "Los pasos para que te vean, numerados y con el que toca resaltado." },
      { kind: "improved", text: "Productos arranca eligiendo cómo cargarlos: Google Sheets, Excel o de a uno." },
      { kind: "improved", text: "En Configuración, «Quién ve tu tienda» va primero." },
    ],
  },
  {
    version: "2.8.0",
    date: "2026-10-19",
    title: "Vender en NODO: elegí la hoja y mirá qué falta para que te vean",
    changes: [
      { kind: "new", text: "Google Sheets con varias pestañas: elegís cuál tiene los productos, y NODO te dice cuál está leyendo." },
      { kind: "new", text: "Excel con varias hojas: al subirlo ves qué hoja se leyó y la cambiás ahí mismo." },
      { kind: "new", text: "«Qué falta para que otros comercios vean tu tienda»: cada paso con su estado y un botón a donde se arregla." },
      { kind: "fixed", text: "Si todos tus productos tienen stock 0, ahora te lo dice: antes la tienda no se veía y no había motivo." },
      { kind: "improved", text: "Cada pestaña de Vender en NODO explica qué se hace ahí, y Productos dice de dónde salen tus productos." },
    ],
  },
  {
    version: "2.7.0",
    date: "2026-10-19",
    title: "Presupuestos para trabajar con miles, y pedidos más prolijos",
    changes: [
      { kind: "new", text: "Presupuestos con nombre de referencia («Oficina Pérez, 3 PCs»): se busca por nombre y sale en el PDF." },
      { kind: "new", text: "Filtros de presupuestos por estado (también vencidos), fechas, quién lo armó y orden, con páginas de a 30." },
      { kind: "new", text: "Vista previa del PDF desde la lista, sin abrir el presupuesto, y qué productos tiene cada uno a la vista." },
      { kind: "improved", text: "PDF nuevo: el total arriba, la tabla con su encabezado en cada hoja, líneas numeradas y menos hojas." },
      { kind: "new", text: "«Agregar proveedor» → «Quiero sumar un distribuidor que no está en la lista»: nos avisás y lo integramos." },
      { kind: "new", text: "«Conectá tu sistema»: si usás un ERP o sistema de gestión, pedí el relevamiento sin cargo de NODO Custom." },
      { kind: "fixed", text: "Los pedidos confirmados ya no quedan para siempre arriba del carrito; los que esperan aprobación se actualizan solos." },
      { kind: "improved", text: "NODO Pro pasa a US$ 35 por mes." },
    ],
  },
  {
    version: "2.6.0",
    date: "2026-10-15",
    title: "Presupuestos con tu plantilla y estados",
    changes: [
      { kind: "new", text: "Plantilla del PDF con tu logo, colores, datos del comercio y condiciones." },
      { kind: "new", text: "Estados del presupuesto: borrador, enviado, aceptado, rechazado y vencido." },
      { kind: "new", text: "Tiendas de otros comercios en Proveedores y fotos de internet para tus productos." },
      { kind: "fixed", text: "El total de la lista de presupuestos es el mismo que el del PDF." },
    ],
  },
  {
    version: "2.5.0",
    date: "2026-10-14",
    title: "Vender en NODO: tu tienda para otros comercios",
    changes: [
      { kind: "new", text: "Vender en NODO: abrí tu tienda para que otros comercios te compren, con perfil, condiciones y quién la ve." },
      { kind: "new", text: "Cargá tus productos desde Google Sheets y se actualizan solos." },
      { kind: "new", text: "La ficha de un producto te lleva al proveedor: al producto, al portal o al WhatsApp del local." },
      { kind: "new", text: "Si recién empezás, ves con qué distribuidores conectarte." },
    ],
  },
  {
    version: "2.4.0",
    date: "2026-10-09",
    title: "Más claro el precio y el estado de cada distribuidor",
    changes: [
      { kind: "new", text: "La ficha del producto muestra cómo se arma el precio offline y el de esquema." },
      { kind: "new", text: "Aviso cuando un distribuidor quedó fuera de la búsqueda, y por qué." },
      { kind: "fixed", text: "Las estadísticas de compras cuentan también los pedidos sin notas." },
    ],
  },
  {
    version: "2.3.0",
    date: "2026-10-08",
    title: "Buscá por código y márgenes por subcategoría",
    changes: [
      { kind: "new", text: "El buscador encuentra productos por SKU, part number, EAN o código del distribuidor." },
      { kind: "new", text: "Márgenes de venta por subcategoría del distribuidor." },
      { kind: "improved", text: "Al cargar la cuenta de un distribuidor, la sincronización queda prendida sola." },
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].version;

/** -1 si a < b, 0 si son iguales, 1 si a > b ("2.10.0" > "2.9.3"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Las versiones posteriores a la última que vio el usuario (o solo la última, si nunca vio ninguna). */
export function unseenEntries(seen: string | null): ChangelogEntry[] {
  if (!seen) return CHANGELOG.slice(0, 1);
  return CHANGELOG.filter((e) => compareVersions(e.version, seen) > 0);
}

export function changelogDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

const seenKey = (userId: string | null | undefined) => `nodo_changelog_seen:${userId ?? "anon"}`;

export function readSeenVersion(userId: string | null | undefined): string | null {
  try {
    return localStorage.getItem(seenKey(userId));
  } catch {
    return APP_VERSION;
  }
}

export function markVersionSeen(userId: string | null | undefined) {
  try {
    localStorage.setItem(seenKey(userId), APP_VERSION);
    window.dispatchEvent(new Event("nodo:changelog-seen"));
  } catch {
    /* sin almacenamiento: el modal no vuelve a molestar en esta sesión igual */
  }
}
