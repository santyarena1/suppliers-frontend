/**
 * Renglones reales de una factura, como los factura el distribuidor (no como
 * se armó el carrito en NODO). Importa sobre todo en los pedidos armados en
 * esquema: el distribuidor junta los componentes en un kit («PC ACTUALIZACION»
 * en Air, «PC ELIT ATENEA» en Elit) que va con su propio IVA (en general 10,5 %),
 * a veces con otro precio y hasta con otros productos que los del pedido.
 *
 * Funciones puras. Lo que el distribuidor no informa queda en null.
 * Revisión con facturas reales: 18/11/2026.
 */

export interface InvoiceLine {
  /** Código del distribuidor (el mismo que usa NODO en el pedido). */
  codigo: string;
  descripcion: string | null;
  cantidad: number;
  /** Precio unitario tal como lo factura el distribuidor (neto de IVA). */
  precio_unitario: number | null;
  iva_porcentaje: number | null;
  impuestos_internos: number | null;
  /** cantidad × precio (neto de IVA). */
  total_linea: number | null;
  moneda: "ARS" | "USD" | null;
  /** Va dentro del esquema (kit). null = no se pudo saber. */
  en_esquema: boolean | null;
  /** Del catálogo del distribuidor en NODO (se completan al armar la respuesta). */
  part_number?: string | null;
  ean?: string | null;
}

export interface InvoiceScheme {
  codigo: string;
  descripcion: string | null;
  /** Lo que factura el kit entero (neto de IVA). */
  total: number | null;
  iva_porcentaje: number | null;
  impuestos_internos: number | null;
  moneda: "ARS" | "USD" | null;
}

export interface InvoiceLines {
  renglones: InvoiceLine[];
  esquema: InvoiceScheme | null;
}

/** Código del renglón de esquema de Air. */
export const AIR_SCHEME_CODE = "42369";

const KNOWN_IVA = [0, 10.5, 21, 27];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "1,234,567.89" (Air, listado) → número. */
function usNumber(s: string): number | null {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** "1.234.567,89" (PDF argentino) → número. */
function arNumber(s: string): number | null {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function ivaPercent(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const p = n > 0 && n <= 1 ? n * 100 : n;
  return KNOWN_IVA.find((k) => Math.abs(k - p) < 0.01) ?? null;
}

// ---------- Air ----------

export interface AirListedItem {
  code: string;
  description: string;
  qty: number;
  price: number | null;
  total: number | null;
}

/** Detalle del portal (`comprobantes.php?q=r`): «54211 UPS HIKVISION 1 0 311,471.04 311,471.04 SUC06». */
export function parseAirListedItems(text: string): AirListedItem[] {
  const t = text.replace(/\s+/g, " ");
  const out: AirListedItem[] = [];
  for (const m of t.matchAll(/(?:^|\s)(\d{2,7}) (.+?) (\d+) \d+ ([\d.,]+) ([\d.,]+) SUC\d+/g)) {
    out.push({ code: m[1], description: m[2].trim(), qty: Number(m[3]), price: usNumber(m[4]), total: usNumber(m[5]) });
  }
  return out;
}

export interface AirPdfLine {
  qty: number;
  code: string;
  description: string;
  iva: number | null;
  internalTax: number | null;
  price: number | null;
  subtotal: number | null;
}

/** Renglones del PDF de la factura: «1 42369 PC ACTUALIZACION 12/0 10,50 14.865,58 2.463.596,91 2.463.596,91». */
export function parseAirPdfLines(text: string): AirPdfLine[] {
  const t = text.replace(/\s+/g, " ");
  const out: AirPdfLine[] = [];
  const re = /(?:^|\s)(\d{1,4}) (\d{2,7}) (.+?) \d+\/\d+ (\d{1,2},\d{2}) ([\d.]+,\d{2}) ([\d.]+,\d{2}) ([\d.]+,\d{2})(?=\s|$)/g;
  for (const m of t.matchAll(re)) {
    out.push({ qty: Number(m[1]), code: m[2], description: m[3].trim(), iva: ivaPercent(arNumber(m[4])), internalTax: arNumber(m[5]), price: arNumber(m[6]), subtotal: arNumber(m[7]) });
  }
  return out;
}

/**
 * Air: el detalle del portal trae todos los productos (los del esquema y los
 * sueltos) con su precio en pesos; el PDF trae solo los renglones facturados
 * (el kit «PC ACTUALIZACION» y los sueltos) con su % de IVA. Lo que está en el
 * detalle pero no en el PDF va dentro del esquema y lleva el IVA del kit.
 */
export function airInvoiceLines(listedText: string, pdfText: string | null): InvoiceLines {
  const listed = parseAirListedItems(listedText);
  const pdf = pdfText ? parseAirPdfLines(pdfText) : [];
  const pdfByCode = new Map(pdf.map((l) => [l.code, l]));
  const kitPdf = pdfByCode.get(AIR_SCHEME_CODE);
  const kitListed = listed.find((l) => l.code === AIR_SCHEME_CODE);
  const hasKit = !!(kitPdf || kitListed);
  const esquema: InvoiceScheme | null = hasKit
    ? {
        codigo: AIR_SCHEME_CODE,
        descripcion: kitPdf?.description ?? kitListed?.description ?? null,
        // El precio del PDF incluye internos; el neto gravado es precio − internos.
        total: kitPdf?.subtotal != null ? r2(kitPdf.subtotal - (kitPdf.internalTax ?? 0)) : kitListed?.total ?? null,
        iva_porcentaje: kitPdf?.iva ?? null,
        impuestos_internos: kitPdf?.internalTax ?? null,
        moneda: "ARS",
      }
    : null;
  const renglones: InvoiceLine[] = listed
    .filter((l) => l.code !== AIR_SCHEME_CODE)
    .map((l) => {
      const own = pdfByCode.get(l.code);
      const inScheme = !hasKit ? false : pdf.length ? !own : null;
      return {
        codigo: l.code,
        descripcion: l.description,
        cantidad: l.qty,
        precio_unitario: l.price,
        iva_porcentaje: own?.iva ?? (inScheme ? (esquema?.iva_porcentaje ?? null) : null),
        impuestos_internos: own ? own.internalTax : null,
        total_linea: l.total,
        moneda: "ARS",
        en_esquema: inScheme,
      };
    });
  return { renglones, esquema };
}

// ---------- Elit ----------

export interface ElitNoteItem {
  code?: string;
  alfaCode?: string;
  name?: string;
  quantity?: number | null;
  price?: number | null;
  net?: number | null;
  vatPercent?: number | null;
  internalTax?: number | null;
  total?: number | null;
  kit?: boolean;
  children?: ElitNoteItem[];
}

/**
 * Elit: renglones de la nota de venta de la factura (en dólares). Un kit
 * (esquema, «PC ELIT ATENEA») trae su importe y los productos de adentro como
 * hijos; los hijos van con el IVA del kit.
 */
export function elitInvoiceLines(items: ElitNoteItem[]): InvoiceLines {
  const line = (i: ElitNoteItem, inScheme: boolean, kitIva: number | null): InvoiceLine => {
    const qty = i.quantity != null && i.quantity > 0 ? i.quantity : 1;
    const price = i.price != null && i.price > 0 ? i.price : null;
    return {
      codigo: String(i.code ?? i.alfaCode ?? "").trim(),
      descripcion: i.name?.trim() || null,
      cantidad: qty,
      precio_unitario: price,
      iva_porcentaje: inScheme ? kitIva : ivaPercent(i.vatPercent),
      impuestos_internos: inScheme ? null : i.internalTax ?? null,
      total_linea: i.net != null ? r2(i.net) : price != null ? r2(price * qty) : null,
      moneda: "USD",
      en_esquema: inScheme,
    };
  };
  const kits = items.filter((i) => i.kit);
  const kit = kits[0];
  const kitIva = kit ? ivaPercent(kit.vatPercent) : null;
  const renglones: InvoiceLine[] = [];
  for (const i of items) {
    if (i.kit) {
      for (const c of i.children ?? []) renglones.push(line(c, true, ivaPercent(i.vatPercent)));
      continue;
    }
    renglones.push(line(i, false, null));
  }
  return {
    renglones: renglones.filter((l) => l.codigo),
    esquema: kit
      ? {
          codigo: String(kit.code ?? kit.alfaCode ?? "").trim(),
          descripcion: kit.name?.trim() || null,
          total: kits.reduce((s, k) => s + (k.net ?? k.total ?? 0), 0) || null,
          iva_porcentaje: kitIva,
          impuestos_internos: kit.internalTax ?? null,
          moneda: "USD",
        }
      : null,
  };
}

// ---------- New Bytes ----------

/** New Bytes: `detalle` de los datos oficiales; `kitId` marca los productos que van en un kit. */
export function nbInvoiceLines(detalle: unknown, kits: unknown, moneda: string | null): InvoiceLines {
  const cur: "ARS" | "USD" | null = moneda === "USD" || moneda === "ARS" ? moneda : null;
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    return v == null || v === "" || !Number.isFinite(n) ? null : n;
  };
  const rows = (Array.isArray(detalle) ? detalle : []).map((raw) => (raw ?? {}) as Record<string, unknown>);
  const renglones: InvoiceLine[] = rows
    .map((it) => {
      const qty = num(it.cantidad) ?? 1;
      const price = num(it.precio);
      return {
        codigo: String(it.id ?? it.sku ?? "").trim(),
        descripcion: it.producto != null ? String(it.producto).trim() : null,
        cantidad: qty,
        precio_unitario: price,
        iva_porcentaje: ivaPercent(it.iva),
        impuestos_internos: num(it.internalTax),
        total_linea: num(it.subtotal) ?? (price != null ? r2(price * qty) : null),
        moneda: cur,
        en_esquema: it.kitId != null && it.kitId !== "",
      };
    })
    .filter((l) => l.codigo);
  const kitRows = (Array.isArray(kits) ? kits : []).map((raw) => (raw ?? {}) as Record<string, unknown>);
  const firstKitId = rows.find((r) => r.kitId != null && r.kitId !== "")?.kitId;
  const kit = kitRows.find((k) => String(k.id ?? k.kitId ?? "") === String(firstKitId ?? "")) ?? kitRows[0];
  return {
    renglones,
    esquema:
      firstKitId != null
        ? {
            codigo: String(firstKitId),
            descripcion: kit ? String(kit.nombre ?? kit.producto ?? kit.descripcion ?? "").trim() || null : null,
            total: kit ? num(kit.subtotal ?? kit.precio ?? kit.total) : null,
            iva_porcentaje: kit ? ivaPercent(kit.iva) : null,
            impuestos_internos: null,
            moneda: cur,
          }
        : null,
  };
}
