import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import axios from "axios";

const SITE_BASE = "https://www.invidcomputers.com";
const LOGIN_URL = `${SITE_BASE}/login.php`;

/**
 * Mapa real de formas de pago del checkout de Invid (valores del radio
 * `opcionPago`, confirmados leyendo el HTML real del carrito autenticado).
 * Solo informativo acá — la elección final de pago se hace a mano en el
 * paso 2 (ver nota en `previewOrder`).
 */
export const INVID_PAYMENT_OPTIONS = [
  { value: "-1", label: "Contado" },
  { value: "67", label: "Depósito/Transferencia Banco" },
  { value: "69", label: "Cheque previa acreditación" },
  { value: "107", label: "Transferencia desde MercadoPag" },
  { value: "132", label: "Tarjeta de Crédito (recargo 5%)" },
] as const;

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

/**
 * Arma pedidos de Invid de forma semi-automática: todo lo que es reversible
 * y de bajo riesgo (login, carrito, direcciones, validar stock e impuestos)
 * lo hace el sistema. El último paso — apretar "CONFIRMAR PEDIDO", que
 * genera un compromiso de compra real con plata real — queda deliberadamente
 * afuera de este servicio y se hace a mano en invidcomputers.com, con el
 * carrito ya armado por acá. No es una limitación técnica: automatizar ese
 * último POST está bloqueado a propósito por el clasificador de seguridad
 * de esta sesión, y aunque no lo estuviera, un pedido real con plata real
 * amerita que el último click lo dé una persona, no un script.
 */
@Injectable()
export class InvidOrderService {
  private readonly logger = new Logger(InvidOrderService.name);

  private async login(username: string, password: string): Promise<string> {
    try {
      const res = await axios.post(
        LOGIN_URL,
        new URLSearchParams({ login: "S", usuari: username, passwd: password, volver: "" }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 20_000,
          maxRedirects: 0,
          validateStatus: (s) => s < 400 || s === 302,
        }
      );
      const cookie = res.headers["set-cookie"]?.map((c: string) => c.split(";")[0]).join("; ");
      if (!cookie) throw new Error("sin cookie de sesión");
      return cookie;
    } catch (err) {
      throw new BadGatewayException(
        `No se pudo iniciar sesión en el portal de Invid: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Direcciones guardadas reales de la cuenta — solo lectura. */
  async getAddresses(credentials: Record<string, string>) {
    const { username, password } = credentials;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");
    const cookie = await this.login(username, password);

    const res = await axios.get<string>(`${SITE_BASE}/select_direcciones.php`, {
      headers: { Cookie: cookie },
      timeout: 15_000,
      responseType: "text",
    });
    const html = res.data;
    const addresses: { id: string; label: string; addressLine: string; isDefault: boolean }[] = [];
    const re = /<input type="radio" name="dir_selected" id="dir_selected_(\d+)" value="\d+" ?(checked="checked")? ?> ?\s*<label[^>]*><b>([^<]*)<\/b><\/label> ([^<]*)<br\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      addresses.push({ id: m[1], label: decodeEntities(m[3].trim()), addressLine: decodeEntities(m[4].trim()), isDefault: !!m[2] });
    }
    return addresses;
  }

  private async getAddressDetail(cookie: string, addressId: string): Promise<AddressField> {
    const res = await axios.get<string>(`${SITE_BASE}/ajaxDatosPersonales.php`, {
      params: { funcion: "getDatosDireccion", id: addressId },
      headers: { Cookie: cookie },
      timeout: 15_000,
      responseType: "text",
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
    return address;
  }

  /** Vacía el carrito real de Invid para esta sesión antes de armar el pedido nuevo, sacando siempre el índice 1 hasta que no quede nada. */
  private async clearCart(cookie: string): Promise<void> {
    for (let i = 0; i < 50; i++) {
      const res = await axios.get<string>(`${SITE_BASE}/carrito.php`, {
        headers: { Cookie: cookie },
        timeout: 15_000,
        responseType: "text",
      });
      if (!/sacarItemCarrito\('1'\)/.test(res.data)) return; // ya no hay item en el índice 1: carrito vacío
      await axios.get(`${SITE_BASE}/ajaxCarrito.php`, {
        params: { funcion: "sacar_carrito", indice: 1 },
        headers: { Cookie: cookie },
        timeout: 15_000,
      });
    }
    this.logger.warn("clearCart de Invid alcanzó el tope de 50 iteraciones — puede haber quedado algo en el carrito");
  }

  private async addItem(cookie: string, code: string, qty: number) {
    const res = await axios.get<string>(`${SITE_BASE}/servicios.php`, {
      params: { servicio: "sumar_a_carrito", producto: code, cantidad: qty },
      headers: { Cookie: cookie },
      timeout: 15_000,
      responseType: "text",
    });
    const xml = res.data;
    const field = (tag: string) => xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`))?.[1] ?? "";
    const nombre = decodeEntities(field("nombre"));
    const monto = Number(field("monto"));
    if (!nombre || !Number.isFinite(monto)) {
      throw new BadRequestException(`Invid rechazó el producto ${code} (sin stock o código inválido)`);
    }
    return { code, qty, name: nombre, price: Number(field("precio")) || 0, subtotal: monto };
  }

  private async validateStock(cookie: string, paymentOption: string, codProvincia: string) {
    const res = await axios.get(`${SITE_BASE}/ajaxCarrito.php`, {
      params: { funcion: "ValidarStockInvid", opcionPago: paymentOption, codprov: codProvincia },
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    return res.data as {
      resultado: boolean;
      mensaje?: string;
      impint?: { impuesto: string; subtotal: string; total: string; nroItem: string }[];
      percepcion?: number;
      domicilioFiscal?: boolean;
    };
  }

  /**
   * Arma el pedido en el carrito REAL de Invid (login, vacía el carrito,
   * agrega los productos, valida stock e impuestos con la dirección
   * elegida) y devuelve un resumen para revisar. El carrito queda armado
   * en la cuenta de Invid — el usuario entra a invidcomputers.com/carrito.php,
   * ve exactamente esto mismo ya cargado, elige forma de entrega si hace
   * falta, y aprieta "CONFIRMAR PEDIDO" ahí mismo. Este método no confirma
   * nada — solo prepara.
   */
  async buildCart(
    credentials: Record<string, string>,
    items: { code: string; qty: number }[],
    addressId: string,
    paymentOption: string
  ) {
    const { username, password } = credentials;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");
    if (items.length === 0) throw new BadRequestException("No hay productos de Invid en el pedido");
    if (!INVID_PAYMENT_OPTIONS.some((p) => p.value === paymentOption)) {
      throw new BadRequestException("Forma de pago no reconocida");
    }

    const cookie = await this.login(username, password);
    await this.clearCart(cookie);

    const addedItems = [];
    for (const item of items) {
      addedItems.push(await this.addItem(cookie, item.code, item.qty));
    }

    const address = await this.getAddressDetail(cookie, addressId);
    const validation = await this.validateStock(cookie, paymentOption, address.CodProvincia);

    const subtotal = addedItems.reduce((s, i) => s + i.subtotal, 0);
    const impTotal = (validation.impint ?? []).reduce((s, i) => s + (Number(i.impuesto) || 0), 0);
    const percepcion = Number(validation.percepcion) || 0;
    const total = subtotal + impTotal + percepcion;

    return {
      items: addedItems,
      address,
      paymentLabel: INVID_PAYMENT_OPTIONS.find((p) => p.value === paymentOption)?.label,
      stockOk: Boolean(validation.resultado),
      stockMessage: validation.mensaje,
      subtotal,
      impuestos: impTotal,
      percepciones: percepcion,
      total,
      checkoutUrl: `${SITE_BASE}/carrito.php`,
    };
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&Aacute;/g, "Á").replace(/&Eacute;/g, "É").replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó").replace(/&Uacute;/g, "Ú").replace(/&Ntilde;/g, "Ñ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
}
