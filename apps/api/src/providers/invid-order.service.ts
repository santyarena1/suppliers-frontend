import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios, { type AxiosResponse } from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { decodeHttpText } from "./http-text";
import { mapProviderDraft, orderOwner, type OrderAuthor } from "./provider-draft";
import {
  decodeEntities,
  parseCheckoutForm,
  parseOrdersTable,
  parseSubmitResult,
  pickPickupDelivery,
  computeInvidTotals,
  stripHtmlMessage,
  parseInvidMoney,
  parseXmlCost,
  parseQuotedShipping,
  collectFormFields,
  type InvidRadioOption,
} from "./invid-order.parser";

const SITE_BASE = "https://www.invidcomputers.com";
const LOGIN_URL = `${SITE_BASE}/login.php`;
const CART_URL = `${SITE_BASE}/carrito.php`;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/**
 * Formas de pago reales del checkout de Invid (radio `opcionPago`).
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

const DRAFT_PAYMENT_VALUES = new Set(INVID_PAYMENT_OPTIONS.map((p) => p.value));

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

interface PreparedCart {
  cookie: string;
  items: {
    code: string;
    qty: number;
    name: string;
    price: number;
    subtotal: number;
    iva: number;
    internos: number;
    percepciones: number;
  }[];
  address: AddressField;
  addressId: string;
  paymentOption: string;
  paymentLabel: string;
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
  cartHtml: string;
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

/**
 * Crea un borrador de pedido en el portal de Invid desde Nodo.
 *
 * Invid documenta el flujo así: confirmar en el carrito deja el pedido
 * *pendiente de procesamiento* y el vendedor de la cuenta contacta al
 * cliente (WhatsApp / mail). No cobra solo: si no se informa el pago
 * en 24 h, Invid da de baja el pedido. Ese POST (`iniciar_pago=S` a
 * carrito.php) es el borrador — no un cobro.
 */
@Injectable()
export class InvidOrderService {
  private readonly logger = new Logger(InvidOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    opts: { params?: Record<string, string | number>; body?: string; timeout?: number } = {}
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
        Accept: HTML_ACCEPT,
        "Accept-Language": "es-AR,es;q=0.9",
      },
      timeout: opts.timeout ?? 20_000,
      responseType: "arraybuffer",
      maxRedirects: 0,
      validateStatus: (s) => s < 400 || s === 302,
    });
    return {
      cookie: this.mergeCookies(cookie, res.headers["set-cookie"]),
      data: decodeHttpText(res.data, res.headers["content-type"]),
      status: res.status,
      location: typeof res.headers.location === "string" ? res.headers.location : undefined,
    };
  }

  paymentOptions() {
    return INVID_PAYMENT_OPTIONS.map((p) => ({ value: p.value, label: p.label }));
  }

  deliveryOptions() {
    return INVID_DELIVERY_OPTIONS.map((d) => ({ value: d.value, label: d.label }));
  }

  /** Direcciones guardadas reales de la cuenta — solo lectura. */
  async getAddresses(credentials: Record<string, string>) {
    const { username, password } = credentials;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");
    const cookie = await this.login(username, password);

    const res = await this.request(cookie, "GET", `${SITE_BASE}/select_direcciones.php`);
    const addresses: { id: string; label: string; addressLine: string; isDefault: boolean }[] = [];
    const re = /<input type="radio" name="dir_selected" id="dir_selected_(\d+)" value="\d+" ?(checked="checked")? ?> ?\s*<label[^>]*><b>([^<]*)<\/b><\/label> ([^<]*)<br\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.data))) {
      addresses.push({
        id: m[1],
        label: decodeEntities(m[3].trim()),
        addressLine: decodeEntities(m[4].trim()),
        isDefault: !!m[2],
      });
    }
    return addresses;
  }

  private async getAddressDetail(cookie: string, addressId: string): Promise<{ cookie: string; address: AddressField }> {
    const res = await this.request(cookie, "GET", `${SITE_BASE}/ajaxDatosPersonales.php`, {
      params: { funcion: "getDatosDireccion", id: addressId },
    });
    const xml = res.data;
    const field = (tag: string) => xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1] ?? "";
    const address: AddressField = {
      Identificador: decodeEntities(field("identificador")),
      Direccion: decodeEntities(field("direccion")),
      NroPuerta: field("nroPuerta"),
      Localidad: decodeEntities(field("localidad")),
      Ciudad: decodeEntities(field("ciudad")),
      CodPostal: field("cod_postal"),
      CodProvincia: field("provincia"),
      Provincia: decodeEntities(field("provincia_nombre")),
      CodPais: field("pais"),
      Pais: decodeEntities(field("pais_nombre")),
    };
    if (!address.Direccion || !address.CodPostal || !address.CodProvincia) {
      throw new BadRequestException("La dirección seleccionada es inválida o está incompleta en Invid");
    }
    return { cookie: res.cookie, address };
  }

  /** Vacía el carrito real de Invid para esta sesión antes de armar el pedido nuevo. */
  private async clearCart(cookie: string): Promise<string> {
    let current = cookie;
    for (let i = 0; i < 50; i++) {
      const cart = await this.request(current, "GET", CART_URL);
      current = cart.cookie;
      if (!/sacarItemCarrito\('1'\)/.test(cart.data)) return current;
      const removed = await this.request(current, "GET", `${SITE_BASE}/ajaxCarrito.php`, {
        params: { funcion: "sacar_carrito", indice: 1 },
      });
      current = removed.cookie;
    }
    this.logger.warn("clearCart de Invid alcanzó el tope de 50 iteraciones — puede haber quedado algo en el carrito");
    return current;
  }

  private async addItem(cookie: string, code: string, qty: number) {
    const res = await this.request(cookie, "GET", `${SITE_BASE}/servicios.php`, {
      params: { servicio: "sumar_a_carrito", producto: code, cantidad: qty },
    });
    const xml = res.data;
    const field = (tag: string) => xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`))?.[1] ?? "";
    const nombre = decodeEntities(field("nombre"));
    const unitNet = Number(field("precio"));
    const lineGross = Number(field("monto"));
    const lineQty = Number(field("cantidad")) || qty;
    const xmlError = stripHtmlMessage(field("error") || field("mensaje") || field("msg"));
    if (!nombre || !Number.isFinite(lineGross)) {
      throw new BadRequestException(
        xmlError || `Invid rechazó el producto ${code} (sin stock o código inválido)`
      );
    }
    const net = Number.isFinite(unitNet) ? unitNet * lineQty : lineGross;
    return {
      cookie: res.cookie,
      item: {
        code,
        qty: lineQty,
        name: nombre,
        price: Number.isFinite(unitNet) ? unitNet : lineGross / lineQty,
        subtotal: net,
        iva: Math.max(0, lineGross - net),
        internos: 0,
        percepciones: 0,
      },
    };
  }

  private async validateStock(cookie: string, paymentOption: string, codProvincia: string) {
    const res = await this.request(cookie, "GET", `${SITE_BASE}/ajaxCarrito.php`, {
      params: { funcion: "ValidarStockInvid", opcionPago: paymentOption, codprov: codProvincia },
    });
    let parsed: {
      resultado: boolean;
      mensaje?: string;
      impint?: { impuesto: string; subtotal: string; total: string; nroItem: string }[];
      percepcion?: number;
      domicilioFiscal?: boolean;
    };
    try {
      parsed = JSON.parse(res.data);
    } catch {
      throw new BadGatewayException("Invid no devolvió un JSON válido al validar stock");
    }
    return { cookie: res.cookie, validation: parsed };
  }

  private async prepareCart(
    credentials: Record<string, string>,
    items: { code: string; qty: number; name?: string }[],
    addressId: string,
    paymentOption: string
  ): Promise<PreparedCart> {
    const { username, password } = credentials;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");
    if (items.length === 0) throw new BadRequestException("No hay productos de Invid en el pedido");
    if (!DRAFT_PAYMENT_VALUES.has(paymentOption as typeof INVID_PAYMENT_OPTIONS[number]["value"])) {
      throw new BadRequestException("Esa forma de pago no sirve para un borrador (la tarjeta se cobra en MercadoPago)");
    }

    let cookie = await this.login(username, password);
    cookie = await this.clearCart(cookie);

    const addedItems: PreparedCart["items"] = [];
    const itemErrors: PreparedCart["itemErrors"] = [];
    for (const item of items) {
      try {
        const added = await this.addItem(cookie, item.code, item.qty);
        cookie = added.cookie;
        addedItems.push(added.item);
      } catch (err) {
        const message = err instanceof BadRequestException
          ? String(err.message)
          : `Invid rechazó el producto ${item.code} (sin stock o código inválido)`;
        itemErrors.push({ code: item.code, name: item.name, message });
      }
    }

    const addr = await this.getAddressDetail(cookie, addressId);
    cookie = addr.cookie;

    let stockOk = false;
    let stockMessage: string | undefined;
    let taxLines: PreparedCart["taxLines"] = [];
    let percepcionPercent = 0;

    if (addedItems.length > 0 && itemErrors.length === 0) {
      const stock = await this.validateStock(cookie, paymentOption, addr.address.CodProvincia);
      cookie = stock.cookie;
      const validation = stock.validation;
      stockOk = Boolean(validation.resultado);
      stockMessage = stockOk
        ? (stripHtmlMessage(validation.mensaje) || "Se han validado los stocks de los productos")
        : (stripHtmlMessage(validation.mensaje) || "Invid no validó el stock de este pedido");
      taxLines = (validation.impint ?? []).map((i) => ({
        nroItem: i.nroItem,
        internos: Number(i.impuesto) || 0,
        subtotal: Number(i.subtotal) || 0,
        total: Number(i.total) || 0,
      }));
      percepcionPercent = Number(validation.percepcion) || 0;
    } else if (itemErrors.length > 0) {
      stockMessage = itemErrors.length === 1
        ? itemErrors[0].message
        : `${itemErrors.length} productos no se pudieron cargar en Invid.`;
    }

    const cart = await this.request(cookie, "GET", CART_URL);
    cookie = cart.cookie;
    const checkout = parseCheckoutForm(cart.data);

    const preparedItems = addedItems.map((item, idx) => {
      const tax = taxLines.find((t) => String(t.nroItem) === String(idx + 1))
        ?? taxLines[idx];
      const internos = tax?.internos ?? 0;
      const percepciones = round2(item.subtotal * (percepcionPercent / 100));
      return { ...item, internos, percepciones };
    });

    const net = preparedItems.reduce((s, i) => s + i.subtotal, 0);
    const ivaProducts = preparedItems.reduce((s, i) => s + i.iva, 0);
    const internos = preparedItems.reduce((s, i) => s + i.internos, 0);
    const totals = computeInvidTotals({
      net,
      ivaProducts,
      internos,
      percepcionPercent,
      shipping: 0,
    });

    return {
      cookie,
      items: preparedItems,
      address: addr.address,
      addressId,
      paymentOption,
      paymentLabel: INVID_PAYMENT_OPTIONS.find((p) => p.value === paymentOption)?.label ?? paymentOption,
      stockOk,
      stockMessage,
      itemErrors,
      subtotal: net,
      iva: ivaProducts,
      impuestos: internos,
      percepcionPercent,
      percepciones: totals.percepciones,
      shippingCost: 0,
      total: totals.total,
      deliveries: checkout.deliveries.length > 0 ? checkout.deliveries : this.deliveryOptions(),
      expresoCompanies: checkout.expresoCompanies,
      payments: checkout.payments.length > 0
        ? checkout.payments.filter((p) => DRAFT_PAYMENT_VALUES.has(p.value as typeof INVID_PAYMENT_OPTIONS[number]["value"]))
        : this.paymentOptions(),
      taxLines,
      cartHtml: cart.data,
    };
  }

  private resolveDelivery(prepared: PreparedCart, deliveryOption?: string) {
    const selected = prepared.deliveries.find((d) => d.value === deliveryOption)
      ?? this.deliveryOptions().find((d) => d.value === deliveryOption);
    if (selected) return selected;
    return pickPickupDelivery(prepared.deliveries) ?? this.deliveryOptions()[0];
  }

  private async quoteShipping(
    cookie: string,
    delivery: InvidRadioOption,
    address: AddressField,
    expresoId?: string,
    paymentOption?: string
  ): Promise<{ cookie: string; shippingCost: number }> {
    let current = cookie;
    let shippingCost = 0;

    try {
      const setDelivery = await this.request(current, "GET", `${SITE_BASE}/ajaxCarrito.php`, {
        params: { funcion: "setearDelivery", tipo_delivery: delivery.value },
      });
      current = setDelivery.cookie;
    } catch (err) {
      this.logger.warn(`setearDelivery falló (${delivery.value}): ${err instanceof Error ? err.message : String(err)}`);
    }

    if (delivery.value === "1") {
      shippingCost = await this.quoteDeliveryXml(current, "1") ?? 0;
    } else if (delivery.value === "5") {
      const quoted = await this.request(current, "GET", `${SITE_BASE}/ajaxCarrito.php`, {
        params: { funcion: "getCostoEnvioXCP", cod_postal: address.CodPostal },
      });
      current = quoted.cookie;
      const parsed = this.parseQuotePayload(quoted.data);
      if (parsed.error) throw new BadRequestException(String(parsed.error));
      shippingCost = parsed.costo;
      if (shippingCost <= 0) {
        const cart = await this.request(current, "GET", CART_URL);
        current = cart.cookie;
        shippingCost = parseQuotedShipping(cart.data, "5") ?? 0;
      }
      if (shippingCost <= 0) {
        throw new BadRequestException(
          `Invid no cotizó Puerta a puerta para el CP ${address.CodPostal}. Probá otra dirección o RETIRA.`
        );
      }
    } else if (delivery.value === "3") {
      if (expresoId) {
        try {
          const quoted = await this.request(current, "GET", `${SITE_BASE}/ajaxCarrito.php`, {
            params: { funcion: "getCostoEnvioExpreso" },
          });
          current = quoted.cookie;
          const parsed = this.parseQuotePayload(quoted.data);
          if (!parsed.error) shippingCost = parsed.costo;
        } catch (err) {
          this.logger.warn(`getCostoEnvioExpreso: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else if (delivery.value === "6") {
      const express = await this.quoteExpressAmba(current, address, paymentOption);
      current = express.cookie;
      shippingCost = express.costo;
      const cart = await this.request(current, "GET", CART_URL);
      current = cart.cookie;
      const fromHtml = parseQuotedShipping(cart.data, "6");
      if (fromHtml != null && fromHtml > 0) shippingCost = fromHtml;
      if (shippingCost <= 0) {
        throw new BadRequestException(
          "Invid no cotizó Entrega Express 24hs para esa dirección. Elegí Puerta a puerta o RETIRA."
        );
      }
    }

    return { cookie: current, shippingCost: round2(shippingCost) };
  }

  private parseQuotePayload(data: string): { costo: number; error?: string; moneda?: string; valor?: number } {
    const trimmed = data.replace(/^\uFEFF/, "").trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        return {
          costo: parseInvidMoney(parsed.costo ?? parsed.valor),
          error: parsed.error != null ? String(parsed.error) : undefined,
          moneda: parsed.mon != null ? String(parsed.mon) : parsed.moneda != null ? String(parsed.moneda) : undefined,
          valor: parseInvidMoney(parsed.valor),
        };
      } catch {
        return { costo: parseXmlCost(trimmed) };
      }
    }
    return { costo: parseXmlCost(trimmed) };
  }

  private async quoteDeliveryXml(cookie: string, tipo: string): Promise<number | null> {
    try {
      const quoted = await this.request(cookie, "GET", `${SITE_BASE}/ajaxCarrito.php`, {
        params: { funcion: "getDelivery", tipo_delivery: tipo },
      });
      return parseXmlCost(quoted.data);
    } catch (err) {
      this.logger.warn(`getDelivery(${tipo}): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private isUsdMoney(moneda?: string) {
    if (!moneda) return true;
    const m = moneda.trim();
    if (m === "1") return true;
    return /us\$|usd|u\$s/i.test(m);
  }

  private async getTipoCambio(cookie: string, paymentOption?: string): Promise<number> {
    const opcion = paymentOption && DRAFT_PAYMENT_VALUES.has(paymentOption as typeof INVID_PAYMENT_OPTIONS[number]["value"])
      ? paymentOption
      : "67";
    const res = await this.request(cookie, "GET", `${SITE_BASE}/ajaxCarrito.php`, {
      params: { funcion: "traerCotizacionOpcionPago", opcion },
    });
    try {
      const parsed = JSON.parse(res.data) as { cotizacion?: number | string; cotizac?: number | string };
      const n = Number(parsed.cotizacion ?? parsed.cotizac);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  private async quoteExpressAmba(
    cookie: string,
    address: AddressField,
    paymentOption?: string
  ): Promise<{ cookie: string; costo: number }> {
    const quoted = await this.request(cookie, "POST", `${SITE_BASE}/cotizarOpcionesEntregar.php`, {
      body: new URLSearchParams({
        direccion: address.Direccion,
        localidad: address.Localidad || address.Ciudad,
        codPostal: address.CodPostal,
        provincia: address.Provincia,
        grabar: "S",
        directo: "S",
      }).toString(),
      timeout: 40_000,
    });
    let first: { status?: string; mensaje?: string };
    try {
      first = JSON.parse(quoted.data);
    } catch {
      throw new BadGatewayException("Invid no pudo cotizar Express 24hs");
    }
    if (first.status !== "ok") {
      throw new BadRequestException(first.mensaje || "Invid no pudo cotizar Express 24hs para esa dirección");
    }

    const saved = await this.request(quoted.cookie, "POST", `${SITE_BASE}/guardarOpcionesEntregar.php`, {
      body: new URLSearchParams({ grabar: "S" }).toString(),
      timeout: 40_000,
    });
    const parsed = this.parseQuotePayload(saved.data);
    let costo = parsed.valor || parsed.costo;
    if (costo > 0 && !this.isUsdMoney(parsed.moneda)) {
      try {
        const tc = await this.getTipoCambio(saved.cookie, paymentOption);
        if (tc > 0) costo = round2(costo / tc);
      } catch (err) {
        this.logger.warn(`tipo de cambio Express: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { cookie: saved.cookie, costo };
  }

  /**
   * Arma el carrito real de Invid y devuelve resumen + formas de entrega
   * leídas del HTML autenticado. No crea el pedido.
   */
  async preview(credentials: Record<string, string>, input: InvidDraftInput) {
    const prepared = await this.prepareCart(credentials, input.items, input.addressId, input.paymentOption);
    const delivery = this.resolveDelivery(prepared, input.deliveryOption);
    const quoted = await this.quoteShipping(
      prepared.cookie,
      delivery,
      prepared.address,
      input.expresoId,
      prepared.paymentOption
    );
    const totals = computeInvidTotals({
      net: prepared.subtotal,
      ivaProducts: prepared.iva,
      internos: prepared.impuestos,
      percepcionPercent: prepared.percepcionPercent,
      shipping: quoted.shippingCost,
    });
    return {
      items: prepared.items,
      address: prepared.address,
      paymentOption: prepared.paymentOption,
      paymentLabel: prepared.paymentLabel,
      payments: prepared.payments,
      deliveries: prepared.deliveries,
      expresoCompanies: prepared.expresoCompanies,
      suggestedDelivery: delivery,
      stockOk: prepared.stockOk,
      stockMessage: prepared.stockMessage,
      itemErrors: prepared.itemErrors,
      subtotal: prepared.subtotal,
      iva: totals.iva,
      impuestos: prepared.impuestos,
      percepcionPercent: prepared.percepcionPercent,
      percepciones: totals.percepciones,
      shippingCost: totals.shipping,
      taxLines: prepared.taxLines,
      total: totals.total,
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

  private async fulfillDraft(
    author: OrderAuthor,
    credentials: Record<string, string>,
    input: InvidDraftInput,
    existingId?: string
  ) {
    const prepared = await this.prepareCart(credentials, input.items, input.addressId, input.paymentOption);
    if (prepared.itemErrors.length > 0) {
      throw new BadRequestException(prepared.itemErrors.map((e) => e.message).join(" · "));
    }
    if (!prepared.stockOk) {
      throw new BadRequestException(prepared.stockMessage || "Invid no validó el stock de este pedido");
    }

    const delivery = this.resolveDelivery(prepared, input.deliveryOption);
    if (delivery.value === "3" && !input.expresoId) {
      throw new BadRequestException("Para EXPRESO tenés que elegir la empresa de transporte");
    }
    const quoted = await this.quoteShipping(
      prepared.cookie,
      delivery,
      prepared.address,
      input.expresoId,
      prepared.paymentOption
    );
    let cookie = quoted.cookie;
    const totals = computeInvidTotals({
      net: prepared.subtotal,
      ivaProducts: prepared.iva,
      internos: prepared.impuestos,
      percepcionPercent: prepared.percepcionPercent,
      shipping: quoted.shippingCost,
    });
    const shippingCost = totals.shipping;
    const total = totals.total;

    const stock = await this.validateStock(cookie, prepared.paymentOption, prepared.address.CodProvincia);
    cookie = stock.cookie;
    if (!stock.validation.resultado) {
      throw new BadRequestException(
        stripHtmlMessage(stock.validation.mensaje) || "Invid no validó el stock de este pedido"
      );
    }

    const rate = await this.getTipoCambio(cookie, prepared.paymentOption);
    const pesosHidden = rate > 0 ? (total * rate).toFixed(2) : total.toFixed(2);
    if (rate <= 0) {
      this.logger.warn("Invid no devolvió cotización ARS; prcmoninv1 va en USD y el portal puede rechazar el POST");
    }

    const cartPage = await this.request(cookie, "GET", CART_URL);
    cookie = cartPage.cookie;

    const fields = collectFormFields(cartPage.data);
    const body = new URLSearchParams(fields);
    body.set("iniciar_pago", "S");
    body.set("dir_entrega", prepared.addressId);
    body.set("identificador_seleccionado", prepared.address.Identificador);
    body.set("direccion_seleccionado", prepared.address.Direccion);
    body.set("nropuerta_seleccionado", prepared.address.NroPuerta);
    body.set("localidad_seleccionado", prepared.address.Localidad);
    body.set("ciudad_seleccionado", prepared.address.Ciudad);
    body.set("codpostal_seleccionado", prepared.address.CodPostal);
    body.set("codprovincia_seleccionado", prepared.address.CodProvincia);
    body.set("provincia_seleccionado", prepared.address.Provincia);
    body.set("codpais_seleccionado", prepared.address.CodPais);
    body.set("pais_seleccionado", prepared.address.Pais);
    body.set("opcionPago", prepared.paymentOption);
    body.set("entrega", delivery.value);
    body.set("costo_envio", String(shippingCost));
    body.set("usa_imi", "true");
    body.set("usa_iva", "true");
    body.set("valida_delivery", fields.valida_delivery || "1");
    // El pedido es en USD. El hidden prcmoninv1 lo llena el portal en pesos
    // (total USD × cotización) antes de CONFIRMAR; sin eso el POST no impacta.
    body.set("prcmoninv1", pesosHidden);
    body.set("percepcionHidden", String(prepared.percepcionPercent));
    body.set("cp_entrega", prepared.address.CodPostal);
    body.set("localidad_entrega", prepared.address.Localidad);
    body.set("provincia_entrega", prepared.address.Provincia);
    if (input.expresoId) body.set("expreso_entrega", input.expresoId);
    if (input.notes) body.set("observaciones", input.notes);
    if (input.payerName) body.set("nombre_pagador", input.payerName);
    if (input.payerEmail) body.set("mail_pagador", input.payerEmail);
    if (fields.termYCond != null || /termYCond/i.test(cartPage.data)) body.set("termYCond", "on");

    this.logger.log(
      `Invid POST iniciar_pago entrega=${delivery.value} pago=${prepared.paymentOption} usd=${total.toFixed(2)} ars=${pesosHidden} loc=?`
    );

    let html = "";
    const submit = await this.request(cookie, "POST", CART_URL, { body: body.toString(), timeout: 40_000 });
    cookie = submit.cookie;
    html = submit.data;

    if (submit.status === 302 && submit.location) {
      const next = submit.location.startsWith("http")
        ? submit.location
        : `${SITE_BASE}/${submit.location.replace(/^\//, "")}`;
      const followed = await this.request(cookie, "GET", next);
      cookie = followed.cookie;
      html = followed.data;
    }

    const parsed = parseSubmitResult(html);
    let orderNumber = parsed.orderNumber;
    let webOrderNumber = parsed.webOrderNumber;
    const created = Boolean(parsed.appearsSuccessful && webOrderNumber);

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
      this.logger.warn(
        `Invid no confirmó el pedido: status=${submit.status} loc=${submit.location ?? "-"} ${parsed.errorMessage || "sin Nro. de PEDIDO WEB"}`
      );
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
      percepciones: totals.percepciones,
      total,
      errorMessage: created ? null : (parsed.errorMessage ?? "Invid no devolvió número de pedido web"),
      items: prepared.items,
      addressSnapshot: {
        id: prepared.addressId,
        ...prepared.address,
        vat: prepared.iva,
        perceptions: totals.percepciones,
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
      percepciones: totals.percepciones,
      shippingCost,
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
