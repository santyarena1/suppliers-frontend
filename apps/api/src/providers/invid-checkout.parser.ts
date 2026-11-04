/**
 * Checkout nuevo de Invid (desde el 2/11/2026): `carrito.php` arma la página
 * con `<section data-checkout-invid data-csrf>` y todo lo demás (editar,
 * eliminar, cotizar, confirmar) va por POST a `carrito.php` con
 * `accion_invid` + `csrf` y responde JSON `{ exito, mensaje?, ... }`.
 * Reemplaza `ajaxCarrito.php` (ValidarStockInvid, sacar_carrito, ...), que
 * ahora responde vacío.
 */
import { decodeEntities, type InvidRadioOption } from "./invid-order.parser";

export interface InvidCheckoutRow {
  index: number;
  code: string;
  qty: number;
  name: string;
}

export interface InvidCheckoutAddress {
  id: string;
  label: string;
  addressLine: string;
  isDefault: boolean;
  provincia: string;
  provinciaNombre: string;
  cp: string;
  localidad: string;
}

export interface InvidCheckoutPage {
  csrf: string | null;
  rows: InvidCheckoutRow[];
  addresses: InvidCheckoutAddress[];
  deliveries: InvidRadioOption[];
  expresoCompanies: InvidRadioOption[];
  payments: InvidRadioOption[];
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return m ? decodeEntities(m[1] ?? m[2] ?? "") : undefined;
}

function hasAttr(tag: string, name: string): boolean {
  return new RegExp(`\\s${name}(?:\\s*=|\\s|>|/)`, "i").test(tag);
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Texto del `<label for=id>` del control, o vacío. Si la etiqueta tiene un
 * `<strong>` (pago, dirección), ese es el nombre; lo demás es detalle ("Sin recargo").
 */
function labelFor(html: string, id: string | undefined): string {
  if (!id) return "";
  const m = html.match(new RegExp(`<label\\b[^>]*\\bfor=["']${id.replace(/[-]/g, "\\-")}["'][^>]*>([\\s\\S]*?)</label>`, "i"));
  if (!m) return "";
  const strong = m[1].match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1];
  return text(strong ?? m[1]);
}

/** Filas `<tr data-indice="N">`: nombre con "(Cód. 0418533)" y la cantidad en el `<input type="number">`. */
export function parseInvidCheckoutRows(html: string): InvidCheckoutRow[] {
  const rows: InvidCheckoutRow[] = [];
  const re = /<tr\b[^>]*\bdata-indice=["'](\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const body = m[2];
    const nameCell = body.match(/<td\b[^>]*class=["'][^"']*checkout-nombre[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? body;
    const nameText = text(nameCell);
    const code = nameText.match(/\(C[oó]d\.?\s*([0-9A-Za-z-]+)\)/i)?.[1];
    if (!code) continue;
    const input = body.match(/<input\b[^>]*type=["']number["'][^>]*>/i)?.[0];
    const qty = Number(input ? attr(input, "value") : NaN);
    rows.push({
      index: Number(m[1]),
      code,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      name: nameText.replace(/\s*\(C[oó]d\.?[^)]*\)\s*$/i, "").trim(),
    });
  }
  return rows;
}

export function parseInvidCheckoutPage(html: string): InvidCheckoutPage {
  const section = html.match(/<section\b[^>]*\bdata-checkout-invid\b[^>]*>/i)?.[0];
  const csrf = section ? attr(section, "data-csrf") ?? null : null;

  const addresses: InvidCheckoutAddress[] = [];
  const deliveries: InvidRadioOption[] = [];
  const payments: InvidRadioOption[] = [];
  for (const tag of html.match(/<input\b[^>]*type=["']radio["'][^>]*>/gi) ?? []) {
    const name = attr(tag, "name");
    const value = attr(tag, "value");
    const id = attr(tag, "id");
    if (!value) continue;
    if (name === "direccion_opcion") {
      const domicilio = attr(tag, "data-domicilio") ?? "";
      const descripcion = attr(tag, "data-descripcion") ?? "";
      addresses.push({
        id: value,
        label: labelFor(html, id) || descripcion || domicilio || `Dirección ${value}`,
        addressLine: domicilio || descripcion,
        isDefault: hasAttr(tag, "checked"),
        provincia: attr(tag, "data-provincia") ?? "",
        provinciaNombre: attr(tag, "data-provincia-nombre") ?? "",
        cp: attr(tag, "data-cp") ?? "",
        localidad: attr(tag, "data-localidad") ?? "",
      });
    } else if (name === "entrega") {
      deliveries.push({ value, label: labelFor(html, id) || value, id });
    } else if (name === "pago") {
      payments.push({ value, label: labelFor(html, id) || value, id });
    }
  }

  const expresoCompanies: InvidRadioOption[] = [];
  const select = html.match(/<select\b[^>]*name=["']expreso["'][^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  for (const opt of select.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const value = attr(`<option ${opt[1]}>`, "value");
    if (value) expresoCompanies.push({ value, label: text(opt[2]) });
  }

  return { csrf, rows: parseInvidCheckoutRows(html), addresses, deliveries, expresoCompanies, payments };
}

/** Renglón de `cotizacion.items` (POST `accion_invid=cotizar`). */
export interface InvidQuoteItem {
  indice: number;
  articulo: string;
  cantidad: number;
  nombre?: string;
  precio: number;
  /** Alícuota en %. */
  iva: number;
  stock?: number;
  subtotal: number;
  iva_importe: number;
  impuesto_interno_importe: number;
  total: number;
}

export interface InvidQuote {
  clave: string;
  vence: number;
  moneda_iso?: string;
  porcentaje_percepcion?: number;
  stocks_validacion?: Record<string, number>;
  tipo_cambio?: { cambio?: number };
  items: InvidQuoteItem[];
  totales: {
    subtotal: number;
    iva: number;
    impuestos_internos: number;
    envio: number;
    percepciones: number;
    recargo?: number;
    total: number;
    total_conversion?: number;
  };
}

export interface InvidActionResult<T = Record<string, unknown>> {
  exito: boolean;
  mensaje?: string;
  data: T;
}

/** Respuesta JSON de una acción del checkout. Si no es JSON (sesión vencida, HTML), `exito` es false. */
export function parseInvidAction<T = Record<string, unknown>>(raw: string): InvidActionResult<T> {
  const trimmed = raw.replace(/^﻿/, "").trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      exito: parsed.exito === true,
      mensaje: typeof parsed.mensaje === "string" ? parsed.mensaje : undefined,
      data: parsed as T,
    };
  } catch {
    return { exito: false, mensaje: trimmed ? "Invid respondió algo que no es JSON" : "Invid respondió vacío", data: {} as T };
  }
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normaliza `cotizacion` (los importes a veces vienen como texto). */
export function normalizeInvidQuote(raw: unknown): InvidQuote | null {
  const c = raw as Record<string, unknown> | null;
  if (!c || typeof c !== "object" || !Array.isArray(c.items) || !c.totales) return null;
  const t = c.totales as Record<string, unknown>;
  return {
    clave: String(c.clave ?? ""),
    vence: num(c.vence),
    moneda_iso: typeof c.moneda_iso === "string" ? c.moneda_iso : undefined,
    porcentaje_percepcion: c.porcentaje_percepcion != null ? num(c.porcentaje_percepcion) : undefined,
    stocks_validacion: (c.stocks_validacion as Record<string, number> | undefined) ?? undefined,
    tipo_cambio: (c.tipo_cambio as { cambio?: number } | undefined) ?? undefined,
    items: (c.items as Record<string, unknown>[]).map((i) => ({
      indice: num(i.indice),
      articulo: String(i.articulo ?? ""),
      cantidad: num(i.cantidad),
      nombre: typeof i.nombre === "string" ? decodeEntities(i.nombre) : undefined,
      precio: num(i.precio),
      iva: num(i.iva),
      stock: i.stock != null ? num(i.stock) : undefined,
      subtotal: num(i.subtotal),
      iva_importe: num(i.iva_importe),
      impuesto_interno_importe: num(i.impuesto_interno_importe),
      total: num(i.total),
    })),
    totales: {
      subtotal: num(t.subtotal),
      iva: num(t.iva),
      impuestos_internos: num(t.impuestos_internos),
      envio: num(t.envio),
      percepciones: num(t.percepciones),
      recargo: num(t.recargo),
      total: num(t.total),
      total_conversion: t.total_conversion != null ? num(t.total_conversion) : undefined,
    },
  };
}
