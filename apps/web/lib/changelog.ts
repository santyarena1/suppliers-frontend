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
