import { knownIvaRate } from "../common/iva-rates";
import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios, { type AxiosResponse } from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { PortalCartSnapshotService } from "./portal-cart-snapshot.service";
import { decodeHttpText } from "./http-text";
import { mapProviderDraft, orderOwner, type OrderAuthor } from "./provider-draft";
import { portalAccountKey, withPortalCartLock } from "./portal-cart-lock";
import {
  decodeEntities,
  parseOrdersTable,
  parseSubmitResult,
  pickPickupDelivery,
  stripHtmlMessage,
  reconcilePortalCart,
  nextCartSnapshot,
  type CartSyncChanges,
  type PortalReconcileFor,
  type InvidRadioOption,
} from "./invid-order.parser";
import {
  normalizeInvidQuote,
  parseInvidAction,
  parseInvidCheckoutPage,
  type InvidCheckoutAddress,
  type InvidCheckoutPage,
  type InvidCheckoutRow,
  type InvidQuote,
} from "./invid-checkout.parser";

const SITE_BASE = "https://www.invidcomputers.com";
const LOGIN_URL = `${SITE_BASE}/login.php`;
const CART_URL = `${SITE_BASE}/carrito.php`;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/**
 * Formas de pago reales del checkout de Invid (radio `pago`).
 * Tarjeta (132) no se ofrece como borrador: abre MercadoPago y no queda
 * pendiente para que el vendedor contacte por WhatsApp.
 */
export const INVID_PAYMENT_OPTIONS = [
  { value: "-1", label: "Contado" },
  { value: "67", label: "Depósito/Transferencia Banco" },
  { value: "69", label: "Cheque previa acreditación" },
  { value: "107", label: "Transferencia desde MercadoPago" },
] as const;

export const INVID_DELIVERY_OPTIONS = [
  { value: "1", label: "RETIRA" },
  { value: "5", label: "Puerta a puerta" },
  { value: "3", label: "EXPRESO (interior, costo contra entrega)" },
  { value: "6", label: "Entrega Express 24hs (AMBA)" },
] as const;

const DRAFT_PAYMENT_VALUES = new Set<string>(INVID_PAYMENT_OPTIONS.map((p) => p.value));

/** `confirmar` dio éxito pero no se pudo leer el número: reintentar podría duplicar el pedido. */
const ACCEPTED_WITHOUT_NUMBER =
  "Invid aceptó el pedido pero NODO no pudo leer el número. Revisá Mis pedidos en Invid antes de volver a intentarlo, para no duplicarlo.";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface AddressField {
  Identificador: string;
  Direccion: string;
  NroPuerta: string;
  Localidad: string;
  Ciudad: string;
  CodPostal: string;
  CodProvincia: string;
  Provincia: string;
  CodPais: string;
  Pais: string;
}

function addressField(a: InvidCheckoutAddress): AddressField {
  const street = a.addressLine.split(" - ")[0] ?? a.addressLine;
  return {
    Identificador: a.label,
    Direccion: street,
    NroPuerta: street.match(/(\d+)\s*$/)?.[1] ?? "",
    Localidad: a.localidad,
    Ciudad: a.localidad,
    CodPostal: a.cp,
    CodProvincia: a.provincia,
    Provincia: a.provinciaNombre,
    CodPais: "AR",
    Pais: "Argentina",
  };
}

type PreparedItem = {
  code: string;
  qty: number;
  name: string;
  price: number;
  subtotal: number;
  iva: number;
  internos: number;
  percepciones: number;
};

interface PreparedCart {
  cookie: string;
  csrf: string;
  items: PreparedItem[];
  address: AddressField;
  addressId: string;
  paymentOption: string;
  paymentLabel: string;
  delivery: InvidRadioOption;
  stockOk: boolean;
  stockMessage?: string;
  itemErrors: { code: string; name?: string; message: string }[];
  subtotal: number;
  iva: number;
  impuestos: number;
  percepcionPercent: number;
  percepciones: number;
  shippingCost: number;
  total: number;
  deliveries: InvidRadioOption[];
  expresoCompanies: InvidRadioOption[];
  payments: InvidRadioOption[];
  taxLines: { nroItem: string; internos: number; subtotal: number; total: number }[];
  /** Cotización vigente de Invid: `clave` es lo que pide `confirmar`. */
  quote: InvidQuote | null;
  /** Cambios hechos en el portal que NODO tiene que reflejar (solo al verificar). */
  sync?: CartSyncChanges;
}

export interface InvidDraftInput {
  items: { code: string; qty: number; name?: string }[];
  addressId: string;
  paymentOption: string;
  deliveryOption?: string;
  expresoId?: string;
  notes?: string;
  payerName?: string;
  payerEmail?: string;
  background?: boolean;
}

/** Lo pedido que Invid cotizó con menos unidades o que no tiene stock para cubrir. */
export function invidShortLines(
  requested: { code: string; qty: number; name?: string }[],
  quote: InvidQuote
): { code: string; name: string; requested: number; available: number }[] {
  const out: { code: string; name: string; requested: number; available: number }[] = [];
  for (const req of requested) {
    const quoted = quote.items.filter((i) => i.articulo === req.code);
    const got = quoted.reduce((s, i) => s + i.cantidad, 0);
    const stock = quote.stocks_validacion?.[req.code] ?? quoted[0]?.stock;
    const available = Math.min(got, stock ?? got);
    if (available < req.qty) {
      out.push({ code: req.code, name: req.name || quoted[0]?.nombre || req.code, requested: req.qty, available: Math.max(0, available) });
    }
  }
  return out;
}

/**
 * Crea un borrador de pedido en el portal de Invid desde Nodo.
 *
 * Invid documenta el flujo así: confirmar en el carrito deja el pedido
 * *pendiente de procesamiento* y el vendedor de la cuenta contacta al
 * cliente (WhatsApp / mail). No cobra solo: si no se informa el pago
 * en 24 h, Invid da de baja el pedido.
 *
 * Desde el 2/11/2026 el checkout es `carrito.php` con acciones JSON
 * (`accion_invid` + `csrf`): `eliminar`, `cotizar` (valida stock e impuestos
 * y devuelve una `clave` que vence) y `confirmar` con esa clave. Ver
 * invid-checkout.parser.ts. Los productos se siguen cargando con
 * `servicios.php?servicio=sumar_a_carrito`.
 */
@Injectable()
export class InvidOrderService {
  private readonly logger = new Logger(InvidOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cartSnapshots: PortalCartSnapshotService
  ) {}

  private mergeCookies(current: string | undefined, setCookie: string[] | undefined): string {
    const map = new Map<string, string>();
    for (const part of (current ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
      const eq = part.indexOf("=");
      if (eq > 0) map.set(part.slice(0, eq), part.slice(eq + 1));
    }
    for (const raw of setCookie ?? []) {
      const pair = raw.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private async login(username: string, password: string): Promise<string> {
    try {
      const res = await axios.post(
        LOGIN_URL,
        new URLSearchParams({ login: "S", usuari: username, passwd: password, volver: "" }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": BROWSER_UA,
            Accept: HTML_ACCEPT,
            "Accept-Language": "es-AR,es;q=0.9",
          },
          timeout: 20_000,
          maxRedirects: 0,
          validateStatus: (s) => s < 400 || s === 302,
        }
      );
      let cookie = this.mergeCookies(undefined, res.headers["set-cookie"]);
      if (!cookie) throw new Error("sin cookie de sesión");
      const location = typeof res.headers.location === "string" ? res.headers.location : undefined;
      if (res.status === 302 && location) {
        const next = location.startsWith("http") ? location : `${SITE_BASE}/${location.replace(/^\//, "")}`;
        const landed = await this.request(cookie, "GET", next);
        cookie = landed.cookie;
      }
      return cookie;
    } catch (err) {
      throw new BadGatewayException(
        `No se pudo iniciar sesión en el portal de Invid: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async request(
    cookie: string,
    method: "GET" | "POST",
    url: string,
    opts: { params?: Record<string, string | number>; body?: string; timeout?: number; accept?: string } = {}
  ): Promise<{ cookie: string; data: string; status: number; location?: string }> {
    const res: AxiosResponse<ArrayBuffer> = await axios.request({
      method,
      url,
      params: opts.params,
      data: opts.body,
      headers: {
        Cookie: cookie,
        ...(opts.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        Referer: CART_URL,
        Origin: SITE_BASE,
        "User-Agent": BROWSER_UA,
        Accept: opts.accept ?? HTML_ACCEPT,
        "Accept-Language": "es-AR,es;q=0.9",
      },
      timeout: opts.timeout ?? 20_000,
      responseType: "arraybuffer",
      maxRedirects: 0,
      // El checkout responde 4xx con JSON `{ exito: false, mensaje }`: se lee igual.
      validateStatus: (s) => s < 500,
    });
    return {
      cookie: this.mergeCookies(cookie, res.headers["set-cookie"]),
      data: decodeHttpText(res.data, res.headers["content-type"]),
      status: res.status,
      location: typeof res.headers.location === "string" ? res.headers.location : undefined,
    };
  }

  /** `carrito.php` autenticado: csrf, filas, direcciones, entregas y pagos. */
  private async cartPage(cookie: string): Promise<{ cookie: string; page: InvidCheckoutPage }> {
    const res = await this.request(cookie, "GET", CART_URL);
    return { cookie: res.cookie, page: parseInvidCheckoutPage(res.data) };
  }

  /** Una acción del checkout (POST carrito.php con `accion_invid` y `csrf`). */
  private async action<T = Record<string, unknown>>(
    cookie: string,
    csrf: string,
    accion: string,
    datos: Record<string, string>,
    timeout = 40_000
  ) {
    const body = new URLSearchParams(datos);
    body.set("accion_invid", accion);
    body.set("csrf", csrf);
    const res = await this.request(cookie, "POST", CART_URL, {
      body: body.toString(),
      accept: "application/json",
      timeout,
    });
    return { cookie: res.cookie, status: res.status, ...parseInvidAction<T>(res.data) };
  }

  paymentOptions() {
    return INVID_PAYMENT_OPTIONS.map((p) => ({ value: p.value, label: p.label }));
  }

  deliveryOptions() {
    return INVID_DELIVERY_OPTIONS.map((d) => ({ value: d.value, label: d.label }));
  }

  /**
   * Direcciones guardadas reales de la cuenta — solo lectura. Con productos en
   * el carrito salen del checkout (con la elegida); si no, de `select_direcciones.php`.
   */
  async getAddresses(credentials: Record<string, string>) {
    const { username, password } = credentials;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");
    const cookie = await this.login(username, password);

    const cart = await this.cartPage(cookie);
    if (cart.page.addresses.length > 0) {
      return cart.page.addresses.map((a) => ({ id: a.id, label: a.label, addressLine: a.addressLine, isDefault: a.isDefault }));
    }
    const res = await this.request(cart.cookie, "GET", `${SITE_BASE}/select_direcciones.php`);
    return parseSelectAddresses(res.data);
  }

  /** Vacía el carrito real de Invid para esta sesión antes de armar el pedido nuevo. */
  private async clearCart(cookie: string): Promise<{ cookie: string; csrf: string | null }> {
    const cart = await this.cartPage(cookie);
    let current = cart.cookie;
    const csrf = cart.page.csrf;
    let rows: { index: number; qty: number }[] = cart.page.rows;
    if (rows.length === 0) return { cookie: current, csrf };
    if (!csrf) {
      this.logger.warn(`Invid clearCart: ${rows.length} filas y la página no trae csrf`);
      return { cookie: current, csrf };
    }
    for (let i = 0; i < 60 && rows.length > 0; i++) {
      const removed = await this.action<{ carrito?: { items?: { indice: number; cantidad: number }[] } }>(
        current,
        csrf,
        "eliminar",
        { indice: String(rows[0].index), cantidad: String(rows[0].qty) },
        20_000
      );
      current = removed.cookie;
      if (!removed.exito) {
        this.logger.warn(`Invid clearCart: no se pudo sacar la fila ${rows[0].index}: ${removed.mensaje ?? "sin mensaje"}`);
        break;
      }
      const left = removed.data.carrito?.items;
      rows = Array.isArray(left) ? left.map((it) => ({ index: Number(it.indice), qty: Number(it.cantidad) || 1 })) : [];
    }
    if (rows.length > 0) this.logger.warn(`Invid clearCart: quedaron ${rows.length} filas sin poder sacar`);
    return { cookie: current, csrf };
  }

  /** Alícuota de cada producto según el catálogo de Invid (es del producto, igual para todos los comercios). */
  private async catalogIvaRates(codes: string[]): Promise<Map<string, number>> {
    if (codes.length === 0) return new Map();
    const rows = await this.prisma.tenantProductOffer.findMany({
      where: { provider: "INVID", externalId: { in: codes }, ivaPercent: { not: null } },
      select: { externalId: true, ivaPercent: true },
      orderBy: { syncedAt: "desc" },
    });
    const out = new Map<string, number>();
    for (const row of rows) {
      const rate = knownIvaRate(Number(row.ivaPercent));
      if (rate !== undefined && !out.has(row.externalId)) out.set(row.externalId, rate);
    }
    return out;
  }

  /**
   * Invid informa la alícuota de cada renglón. Solo se acepta si es una que
   * existe (21 %, 10,5 %...); si no, se usa la del catálogo (o 21 %, la
   * general) y queda en el log.
   */
  private checkedLineIva(code: string, subtotal: number, iva: number, catalogRates: Map<string, number>): number {
    if (!(subtotal > 0)) return iva;
    const percent = (iva / subtotal) * 100;
    if (knownIvaRate(percent) !== undefined) return iva;
    const fallback = catalogRates.get(code) ?? 21;
    const fixed = round2(subtotal * (fallback / 100));
    this.logger.warn(
      `Invid IVA fuera de rango en ${code}: ${iva} sobre ${subtotal} (${percent.toFixed(1)} %); se usa ${fallback} % = ${fixed}`
    );
    return fixed;
  }

  private async addItem(cookie: string, code: string, qty: number) {
    const res = await this.request(cookie, "GET", `${SITE_BASE}/servicios.php`, {
      params: { servicio: "sumar_a_carrito", producto: code, cantidad: qty },
    });
    const xml = res.data;
    const field = (tag: string) => xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`))?.[1] ?? "";
    const nombre = decodeEntities(field("nombre"));
    const xmlError = stripHtmlMessage(field("error") || field("mensaje") || field("msg"));
    if (xmlError || !nombre) {
      throw new BadRequestException(xmlError || `Invid rechazó el producto ${code} (sin stock o código inválido)`);
    }
    return { cookie: res.cookie, name: nombre };
  }

  /**
   * Cotiza el carrito ya cargado con la dirección, la entrega y el pago:
   * Invid valida stock, calcula IVA, internos, percepciones y envío y
   * devuelve la `clave` para confirmar. Express 24 hs y Puerta a puerta se
   * cotizan antes aparte, como hace la página.
   */
  private async quoteCart(
    cookie: string,
    csrf: string,
    input: { addressId: string; delivery: string; expresoId?: string; paymentOption: string; notes?: string; payerName?: string; payerEmail?: string }
  ): Promise<{ cookie: string; quote: InvidQuote | null; message?: string }> {
    let current = cookie;
    const pre =
      input.delivery === "6"
        ? await this.action(current, csrf, "cotizar_entrega", { direccion: input.addressId, entrega: "6" })
        : input.delivery === "5"
          ? await this.action(current, csrf, "cotizar_envio_cp", { direccion: input.addressId, entrega: "5" })
          : input.delivery === "3" && input.expresoId
            ? await this.action(current, csrf, "cotizar_expreso", { direccion: input.addressId, entrega: "3", expreso: input.expresoId })
            : null;
    if (pre) {
      current = pre.cookie;
      if (!pre.exito) return { cookie: current, quote: null, message: pre.mensaje || "Invid no pudo cotizar el envío" };
    }
    const [nombre, ...apellido] = (input.payerName ?? "").trim().split(/\s+/).filter(Boolean);
    const res = await this.action<{ cotizacion?: unknown }>(current, csrf, "cotizar", {
      direccion: input.addressId,
      direccion_opcion: input.addressId,
      entrega: input.delivery,
      expreso: input.expresoId ?? "",
      pago: input.paymentOption,
      nombre_pagador: nombre ?? "",
      apellido_pagador: apellido.join(" "),
      email_pagador: input.payerEmail ?? "",
      notas: input.notes ?? "",
    });
    if (!res.exito) return { cookie: res.cookie, quote: null, message: stripHtmlMessage(res.mensaje) || "Invid no validó el stock de este pedido" };
    const quote = normalizeInvidQuote(res.data.cotizacion);
    if (!quote) return { cookie: res.cookie, quote: null, message: "Invid devolvió una cotización que NODO no puede leer" };
    return { cookie: res.cookie, quote };
  }

  /**
   * Arma el carrito real del portal con lo que hay que cotizar y lo cotiza.
   *
   * Con `reconcileFor` (verificación desde el carrito de NODO) primero se lee
   * lo que el portal tiene y se unifica con NODO: lo compartido se suma y lo
   * que solo está en Invid queda pendiente en `sync`. Sin `reconcileFor`
   * (confirmar un pedido) el portal se arma exactamente con lo que NODO manda.
   */
  private async prepareCart(
    credentials: Record<string, string>,
    input: InvidDraftInput,
    reconcileFor?: PortalReconcileFor
  ): Promise<PreparedCart> {
    const { username, password } = credentials;
    const requested = input.items;
    const paymentOption = input.paymentOption;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");
    if (requested.length === 0) throw new BadRequestException("No hay productos de Invid en el pedido");
    if (!DRAFT_PAYMENT_VALUES.has(paymentOption)) {
      throw new BadRequestException("Esa forma de pago no sirve para un borrador (la tarjeta se cobra en MercadoPago)");
    }

    let cookie = await this.login(username, password);

    let items = requested;
    let sync: CartSyncChanges | undefined;
    let previousSnapshot: Record<string, number> | null = null;
    if (reconcileFor) {
      const cart = await this.cartPage(cookie);
      cookie = cart.cookie;
      const portalLines: InvidCheckoutRow[] = cart.page.rows;
      previousSnapshot = await this.cartSnapshots.load(reconcileFor.tenantId, "INVID");
      const reconciled = reconcilePortalCart(requested, portalLines, previousSnapshot, {
        sessionScoped: true,
        dropPortalCodes: reconcileFor.dropPortalCodes,
      });
      items = reconciled.merged;
      sync = reconciled.changes;
      this.logger.log(
        `Invid conciliación: portal=${JSON.stringify(portalLines.map((l) => [l.code, l.qty]))} ` +
        `nodo=${JSON.stringify(requested.map((i) => [i.code, i.qty]))} foto=${JSON.stringify(previousSnapshot)} ` +
        `→ ${JSON.stringify(items.map((i) => [i.code, i.qty]))} cambios=${JSON.stringify(sync)}`
      );
    }

    cookie = (await this.clearCart(cookie)).cookie;

    const added: { code: string; qty: number; name: string }[] = [];
    const itemErrors: PreparedCart["itemErrors"] = [];
    for (const item of items) {
      try {
        const res = await this.addItem(cookie, item.code, item.qty);
        cookie = res.cookie;
        added.push({ code: item.code, qty: item.qty, name: res.name });
      } catch (err) {
        const message = err instanceof BadRequestException
          ? String(err.message)
          : `Invid rechazó el producto ${item.code} (sin stock o código inválido)`;
        itemErrors.push({ code: item.code, name: item.name, message });
      }
    }

    const cart = await this.cartPage(cookie);
    cookie = cart.cookie;
    const page = cart.page;
    if (!page.csrf) throw new BadGatewayException("Invid no devolvió el checkout (sin csrf): puede que haya cambiado la página otra vez");
    let pageAddress = page.addresses.find((a) => a.id === input.addressId);
    if (!pageAddress && page.rows.length === 0) {
      // Con el carrito vacío (Invid rechazó todo) el checkout no muestra direcciones.
      const res = await this.request(cookie, "GET", `${SITE_BASE}/select_direcciones.php`);
      cookie = res.cookie;
      const listed = parseSelectAddresses(res.data).find((a) => a.id === input.addressId);
      if (listed) {
        pageAddress = { ...listed, provincia: "", provinciaNombre: "", cp: listed.addressLine.match(/\((\d{4})\)/)?.[1] ?? "", localidad: "" };
      }
    }
    if (!pageAddress) throw new BadRequestException("Esa dirección no está en tu cuenta de Invid");

    const deliveries = page.deliveries.length > 0 ? page.deliveries : this.deliveryOptions();
    const delivery = deliveries.find((d) => d.value === input.deliveryOption)
      ?? this.deliveryOptions().find((d) => d.value === input.deliveryOption)
      ?? pickPickupDelivery(deliveries)
      ?? this.deliveryOptions()[0];

    let quote: InvidQuote | null = null;
    let stockMessage: string | undefined;
    if (added.length > 0 && itemErrors.length === 0) {
      const quoted = await this.quoteCart(cookie, page.csrf, {
        addressId: input.addressId,
        delivery: delivery.value === "3" && !input.expresoId ? "1" : delivery.value,
        expresoId: input.expresoId,
        paymentOption,
        notes: input.notes,
        payerName: input.payerName,
        payerEmail: input.payerEmail,
      });
      cookie = quoted.cookie;
      quote = quoted.quote;
      stockMessage = quoted.message;
    } else if (itemErrors.length > 0) {
      stockMessage = itemErrors.length === 1
        ? itemErrors[0].message
        : `${itemErrors.length} productos no se pudieron cargar en Invid.`;
    }

    // Con el nombre que tiene en NODO, que es como el comercio lo reconoce.
    const short = quote
      ? invidShortLines(added.map((a) => ({ ...a, name: items.find((i) => i.code === a.code)?.name || a.name })), quote)
      : [];
    if (short.length > 0) {
      stockMessage = `Invid no tiene stock para todo: ${short
        .map((s) => `${s.name}: pediste ${s.requested}, hay ${s.available}`)
        .join(" · ")}`;
    }
    const stockOk = Boolean(quote) && short.length === 0 && itemErrors.length === 0;
    if (quote && stockOk && !stockMessage) stockMessage = "Se han validado los stocks de los productos";

    // Lo que quedó cargado en el portal es la foto para la próxima verificación.
    if (reconcileFor && sync) {
      await this.cartSnapshots.save(reconcileFor.tenantId, "INVID", nextCartSnapshot(added, sync, previousSnapshot));
    }

    const percepcionPercent = quote?.porcentaje_percepcion ?? 0;
    const catalogRates = await this.catalogIvaRates(added.map((item) => item.code));
    const preparedItems: PreparedItem[] = quote
      ? quote.items.map((q) => {
          const req = added.find((a) => a.code === q.articulo);
          const iva = knownIvaRate(q.iva) !== undefined ? round2(q.iva_importe) : this.checkedLineIva(q.articulo, q.subtotal, q.iva_importe, catalogRates);
          return {
            code: q.articulo,
            qty: q.cantidad,
            name: q.nombre || req?.name || q.articulo,
            price: q.precio,
            subtotal: round2(q.subtotal),
            iva,
            internos: round2(q.impuesto_interno_importe),
            percepciones: round2(q.subtotal * (percepcionPercent / 100)),
          };
        })
      : added.map((a) => ({ code: a.code, qty: a.qty, name: a.name, price: 0, subtotal: 0, iva: 0, internos: 0, percepciones: 0 }));

    const t = quote?.totales;
    const address = addressField(pageAddress);
    const payments = page.payments.length > 0
      ? page.payments.filter((p) => DRAFT_PAYMENT_VALUES.has(p.value))
      : this.paymentOptions();
    return {
      cookie,
      csrf: page.csrf,
      items: preparedItems,
      address,
      addressId: input.addressId,
      paymentOption,
      paymentLabel: payments.find((p) => p.value === paymentOption)?.label
        ?? INVID_PAYMENT_OPTIONS.find((p) => p.value === paymentOption)?.label
        ?? paymentOption,
      delivery,
      stockOk,
      stockMessage,
      itemErrors,
      subtotal: round2(t?.subtotal ?? 0),
      iva: round2(t?.iva ?? 0),
      impuestos: round2(t?.impuestos_internos ?? 0),
      percepcionPercent,
      percepciones: round2(t?.percepciones ?? 0),
      shippingCost: round2(t?.envio ?? 0),
      total: round2(t?.total ?? 0),
      deliveries,
      expresoCompanies: page.expresoCompanies,
      payments,
      taxLines: (quote?.items ?? []).map((q) => ({
        nroItem: String(q.indice),
        internos: round2(q.impuesto_interno_importe),
        subtotal: round2(q.subtotal),
        total: round2(q.total),
      })),
      quote,
      sync,
    };
  }

  /**
   * Arma el carrito real de Invid y devuelve resumen + formas de entrega
   * leídas del checkout autenticado. No crea el pedido.
   */
  preview(credentials: Record<string, string>, input: InvidDraftInput, reconcileFor?: PortalReconcileFor) {
    return withPortalCartLock(portalAccountKey("INVID", credentials.username), () =>
      this.previewUnlocked(credentials, input, reconcileFor)
    );
  }

  private async previewUnlocked(credentials: Record<string, string>, input: InvidDraftInput, reconcileFor?: PortalReconcileFor) {
    const prepared = await this.prepareCart(credentials, input, reconcileFor);
    // El carrito de Invid es por sesión de login y el portal a veces hereda el
    // de una sesión vencida: si esta queda cargada, el comercio puede entrar
    // al portal y encontrarse los productos de NODO sumados a los suyos. Se
    // deja vacía; el borrador la vuelve a armar al confirmar.
    try {
      await this.clearCart(prepared.cookie);
    } catch (err) {
      this.logger.warn(`No se pudo vaciar el carrito de Invid después de cotizar: ${String(err)}`);
    }
    return {
      items: prepared.items,
      sync: prepared.sync,
      address: prepared.address,
      paymentOption: prepared.paymentOption,
      paymentLabel: prepared.paymentLabel,
      payments: prepared.payments,
      deliveries: prepared.deliveries,
      expresoCompanies: prepared.expresoCompanies,
      suggestedDelivery: prepared.delivery,
      stockOk: prepared.stockOk,
      stockMessage: prepared.stockMessage,
      itemErrors: prepared.itemErrors,
      subtotal: prepared.subtotal,
      iva: prepared.iva,
      impuestos: prepared.impuestos,
      percepcionPercent: prepared.percepcionPercent,
      percepciones: prepared.percepciones,
      shippingCost: prepared.shippingCost,
      taxLines: prepared.taxLines,
      total: prepared.total,
      note: "Esto todavía no crea el pedido. Al confirmar, Invid deja un borrador pendiente y el vendedor de la cuenta te contacta.",
    };
  }

  async listDrafts(tenantId: string) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId, provider: "INVID" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapProviderDraft);
  }

  async getDraft(tenantId: string, id: string) {
    return this.prisma.providerOrder.findFirst({
      where: { id, tenantId, provider: "INVID" },
    });
  }

  /**
   * Crea el borrador en Invid (POST iniciar_pago=S) y guarda una copia en Nodo.
   * Confirmado en vivo: el portal responde 302 a mensaje.php con
   * "Nro. de PEDIDO WEB asignado: NNNNN". Eso es el éxito. La fila en
   * lista_pedidos tarda un rato más y no se usa para confirmar.
   */
  async submitDraft(author: OrderAuthor, credentials: Record<string, string>, input: InvidDraftInput) {
    if (input.background) {
      const pending = await this.prisma.providerOrder.create({
        data: {
          ...orderOwner(author),
          provider: "INVID",
          status: "PENDING",
          paymentOption: input.paymentOption,
          deliveryOption: input.deliveryOption ?? "1",
          notes: input.notes,
          items: input.items,
          addressSnapshot: { id: input.addressId },
        },
      });
      setImmediate(() => {
        this.fulfillDraft(author, credentials, input, pending.id).catch(async (err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`Invid draft background ${pending.id}: ${message}`);
          await this.prisma.providerOrder.update({
            where: { id: pending.id },
            data: { status: "FAILED", errorMessage: message.slice(0, 500) },
          }).catch((updateErr: unknown) => this.logger.error(String(updateErr)));
        });
      });
      return {
        id: pending.id,
        status: "PENDING" as const,
        orderNumber: null,
        webOrderNumber: null,
        paymentLabel: null,
        deliveryLabel: null,
        items: input.items,
        total: null,
        message: "El pedido se está creando en Invid. Podés seguir usando Nodo; el número de pedido web aparece en el historial cuando Invid lo confirma.",
      };
    }
    return this.fulfillDraft(author, credentials, input);
  }

  /** Envía a Invid un pedido que estaba esperando la aprobación del dueño del comercio. */
  approveDraft(author: OrderAuthor, credentials: Record<string, string>, input: InvidDraftInput, orderId: string) {
    return this.fulfillDraft(author, credentials, input, orderId);
  }

  /** De vaciar el carrito a `confirmar`, nadie más toca la cuenta: una cotización en el medio cambiaría el pedido. */
  private fulfillDraft(
    author: OrderAuthor,
    credentials: Record<string, string>,
    input: InvidDraftInput,
    existingId?: string
  ) {
    return withPortalCartLock(portalAccountKey("INVID", credentials.username), () =>
      this.fulfillDraftUnlocked(author, credentials, input, existingId)
    );
  }

  private async fulfillDraftUnlocked(
    author: OrderAuthor,
    credentials: Record<string, string>,
    input: InvidDraftInput,
    existingId?: string
  ) {
    if (input.deliveryOption === "3" && !input.expresoId) {
      throw new BadRequestException("Para EXPRESO tenés que elegir la empresa de transporte");
    }
    const prepared = await this.prepareCart(credentials, input);
    if (prepared.itemErrors.length > 0) {
      throw new BadRequestException(prepared.itemErrors.map((e) => e.message).join(" · "));
    }
    if (!prepared.stockOk || !prepared.quote?.clave) {
      throw new BadRequestException(prepared.stockMessage || "Invid no validó el stock de este pedido");
    }

    const delivery = prepared.delivery;
    const total = prepared.total;
    let cookie = prepared.cookie;
    this.logger.log(
      `Invid confirmar entrega=${delivery.value} pago=${prepared.paymentOption} usd=${total.toFixed(2)} items=${prepared.items.length}`
    );

    const confirmed = await this.action<{ pedido?: string | number; redireccion?: string; pago?: Record<string, unknown> }>(
      cookie,
      prepared.csrf,
      "confirmar",
      { clave: prepared.quote.clave },
      60_000
    );
    cookie = confirmed.cookie;

    let webOrderNumber = confirmed.data.pedido != null && String(confirmed.data.pedido).trim() ? String(confirmed.data.pedido).trim() : undefined;
    let orderNumber: string | undefined;
    let errorMessage = confirmed.exito ? undefined : stripHtmlMessage(confirmed.mensaje) || "Invid no confirmó el pedido";
    // Algunos pagos terminan en otra página (mensaje.php con el número de pedido web).
    if (confirmed.exito && !webOrderNumber && confirmed.data.redireccion) {
      const loc = confirmed.data.redireccion;
      const next = loc.startsWith("http") ? loc : `${SITE_BASE}/${loc.replace(/^\//, "")}`;
      try {
        const followed = await this.request(cookie, "GET", next);
        cookie = followed.cookie;
        const parsed = parseSubmitResult(followed.data);
        webOrderNumber = parsed.webOrderNumber;
        orderNumber = parsed.orderNumber;
      } catch (err) {
        this.logger.warn(`Invid: no se pudo leer la página después de confirmar: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const created = Boolean(confirmed.exito && webOrderNumber && !errorMessage);
    if (confirmed.exito && !webOrderNumber) {
      errorMessage = ACCEPTED_WITHOUT_NUMBER;
      this.logger.warn(`Invid confirmar sin número: claves ${Object.keys(confirmed.data).join(",")}`);
    }

    if (created) {
      // El pedido se llevó el carrito del portal: la foto vieja ya no describe nada.
      await this.cartSnapshots.clear(author.tenantId, "INVID").catch((err: unknown) =>
        this.logger.warn(`No se pudo limpiar la foto del carrito de Invid: ${String(err)}`)
      );
    }

    if (created && webOrderNumber && existingId) {
      try {
        const listed = await this.findListedWebOrder(cookie, webOrderNumber, 45_000);
        if (listed) {
          cookie = listed.cookie;
          orderNumber = listed.orderNumber || orderNumber;
          webOrderNumber = listed.webOrderNumber || webOrderNumber;
        }
      } catch (err) {
        this.logger.warn(`lista_pedidos todavía no muestra ${webOrderNumber}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!created) {
      this.logger.warn(`Invid no confirmó el pedido: status=${confirmed.status} ${errorMessage ?? ""}`);
    }

    const payload = {
      status: created ? "CREATED" : "FAILED",
      invidOrderNumber: orderNumber ?? null,
      invidWebOrderNumber: webOrderNumber ?? null,
      paymentOption: prepared.paymentOption,
      paymentLabel: prepared.paymentLabel,
      deliveryOption: delivery.value,
      deliveryLabel: delivery.label,
      notes: input.notes,
      subtotal: prepared.subtotal,
      impuestos: prepared.impuestos,
      percepciones: prepared.percepciones,
      total,
      errorMessage: created ? null : (errorMessage ?? "Invid no devolvió número de pedido web"),
      items: prepared.items,
      addressSnapshot: {
        id: prepared.addressId,
        ...prepared.address,
        vat: prepared.iva,
        perceptions: prepared.percepciones,
        internalTax: prepared.impuestos,
        subtotal: prepared.subtotal,
        total,
      },
    };

    const record = existingId
      ? await this.prisma.providerOrder.update({ where: { id: existingId }, data: payload })
      : await this.prisma.providerOrder.create({
          data: { ...orderOwner(author), provider: "INVID", ...payload },
        });

    if (!created) {
      throw new BadGatewayException(record.errorMessage || "No se pudo crear el borrador en Invid");
    }

    return {
      id: record.id,
      status: record.status,
      orderNumber: record.invidOrderNumber,
      webOrderNumber: record.invidWebOrderNumber,
      paymentLabel: record.paymentLabel,
      deliveryLabel: record.deliveryLabel,
      items: prepared.items,
      address: prepared.address,
      subtotal: prepared.subtotal,
      impuestos: prepared.impuestos,
      percepciones: prepared.percepciones,
      shippingCost: prepared.shippingCost,
      total,
      message: webOrderNumber
        ? `Pedido confirmado en Invid. Pedido web ${webOrderNumber}. El vendedor de la cuenta te contacta; si no se informa el pago en 24 h, Invid lo da de baja. En Mis pedidos puede tardar un rato en aparecer.`
        : "Borrador creado en Invid.",
    };
  }

  private async findListedWebOrder(cookie: string, webOrderNumber: string, budgetMs: number) {
    const started = Date.now();
    let current = cookie;
    let delay = 2500;
    while (Date.now() - started < budgetMs) {
      const page = await this.request(current, "GET", `${SITE_BASE}/lista_pedidos_invid.php`);
      current = page.cookie;
      const match = parseOrdersTable(page.data).orders.find((o) => o.webOrderNumber === webOrderNumber);
      if (match) return { cookie: current, ...match };
      const remaining = budgetMs - (Date.now() - started);
      if (remaining <= 0) break;
      await new Promise((r) => setTimeout(r, Math.min(delay, remaining)));
      delay = Math.min(delay * 2, 12_000);
    }
    return null;
  }
}

/**
 * `select_direcciones.php`: `<input type="radio" name="dir_selected" value="N"> <b>Nombre</b><br>Calle - Localidad (CP)<br>`.
 * Se usa cuando el carrito está vacío y el checkout no muestra las direcciones.
 */
export function parseSelectAddresses(html: string): { id: string; label: string; addressLine: string; isDefault: boolean }[] {
  const out: { id: string; label: string; addressLine: string; isDefault: boolean }[] = [];
  const re = /<input\b[^>]*name=["']dir_selected["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const id = tag.match(/\bvalue=["'](\d+)["']/i)?.[1];
    if (!id) continue;
    const after = html.slice(m.index + tag.length).split(/<\/li>|<input\b/i)[0] ?? "";
    const label = decodeEntities(after.match(/<b\b[^>]*>([\s\S]*?)<\/b>/i)?.[1]?.replace(/<[^>]*>/g, "").trim() ?? "");
    const line = decodeEntities(after.replace(/<b\b[^>]*>[\s\S]*?<\/b>/i, "").split(/<br\s*\/?>/i).map((s) => s.replace(/<[^>]*>/g, "").trim()).filter(Boolean)[0] ?? "");
    out.push({ id, label: label || line || `Dirección ${id}`, addressLine: line, isDefault: /\bchecked\b/i.test(tag) });
  }
  return out;
}
