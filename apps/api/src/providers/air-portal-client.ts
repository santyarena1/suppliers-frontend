import { BadGatewayException, BadRequestException } from "@nestjs/common";
import axios, { type AxiosRequestConfig } from "axios";
import { asNumber, asRecord, asString, axiosErrorMessage, unwrapList } from "./json-value";
import { parseSelectOptions } from "./html-table";

export const AIR_PORTAL_URL = "https://www.air-intra.com/2025/ar/";
export const AIR_CANASTO_URL = "https://www.air-intra.com/2025/ar/canasto.php";
export const AIR_CANASTO_DIRECTO_URL = "https://www.air-intra.com/2025/ar/canasto_directo.php";
export const AIR_CANASTO_UI_URL = "https://www.air-intra.com/2025/ar/canasto_d.php";
export const AIR_DEBEHABER_URL = "https://www.air-intra.com/2025/consultas/debehaber.php";
export const AIR_COMPROBANTES_URL = "https://www.air-intra.com/2025/consultas/comprobantes.php";
export const AIR_CPT_PENDIENTES_URL = "https://www.air-intra.com/2025/consultas/cpt_pendientes.php";

export const AIR_PAYMENTS: { value: string; label: string }[] = [
  { value: "01", label: "Depósito, Transferencia" },
  { value: "02", label: "Paga cuando retira" },
  { value: "03", label: "Cheque electrónico" },
  { value: "04", label: "Pago en línea" },
];

export const AIR_DELIVERIES: { value: string; label: string }[] = [
  { value: "01", label: "Retira en depósito" },
  { value: "02", label: "Retira comisionista" },
  { value: "03", label: "Retira transporte" },
  { value: "04", label: "Reparto a confirmar" },
  { value: "05", label: "Drop Shipping" },
];

export const AIR_BRANCHES: { value: string; label: string }[] = [
  { value: "SUC02", label: "Rosario" },
  { value: "SUC03", label: "Mendoza" },
  { value: "SUC04", label: "Córdoba" },
  { value: "SUC06", label: "Lugano" },
];

export interface AirCredentials {
  user: string;
  pass: string;
}

export function parseAirCredentials(raw: Record<string, string>): AirCredentials {
  const user = (raw.user || raw.username || "").trim();
  const pass = (raw.pass || raw.password || "").trim();
  if (!user || !pass) throw new BadGatewayException("Credenciales de Air incompletas");
  return { user, pass };
}

export interface AirCartItem {
  codiart: string;
  cantidad: number;
  precio: number;
  baseImponible: number;
  ivaAli: number;
  ivaNeto: number;
  renglon: number;
  descart: string;
  grabado: string;
}

export interface AirCart {
  nrocompro: string;
  sucursal: string;
  vendedor: string;
  pago: string;
  entrega: string;
  transporte: string;
  texto: string;
  items: AirCartItem[];
  subtotal: number;
  total: number;
  iva21: number;
  iva105: number;
  ii: number;
  dropEntregaId: string;
  raw: Record<string, unknown>;
}

function cookieFrom(res: { headers: { "set-cookie"?: string[] } }): string | undefined {
  return res.headers["set-cookie"]?.map((c) => c.split(";")[0]).join("; ");
}

function parseCart(body: unknown): AirCart {
  const rec = asRecord(body) ?? {};
  const items = unwrapList(rec.items).map((row) => {
    const it = asRecord(row) ?? {};
    return {
      codiart: asString(it.codiart) || "",
      cantidad: asNumber(it.cantidad) ?? 0,
      precio: asNumber(it.precio) ?? 0,
      baseImponible: asNumber(it.base_imponible) ?? 0,
      ivaAli: asNumber(it.iva_ali) ?? 0,
      ivaNeto: asNumber(it.iva_neto) ?? 0,
      renglon: asNumber(it.renglon) ?? 0,
      descart: asString(it.descart) || asString(it.codiart) || "",
      grabado: asString(it.grabado) || "",
    };
  });
  const totales = asRecord(rec.totales) ?? {};
  const iva1 = asRecord(rec.iva_1) ?? {};
  const iva3 = asRecord(rec.iva_3) ?? {};
  const ii = asRecord(rec.ii) ?? {};
  return {
    nrocompro: asString(rec.nrocompro) || "0",
    sucursal: asString(rec.sucursal) || "",
    vendedor: asString(rec.vendedor) || "",
    pago: asString(rec.pago) || "",
    entrega: asString(rec.entrega) || "",
    transporte: asString(rec.transporte) || "",
    texto: asString(rec.texto) || "",
    items,
    subtotal: asNumber(totales.subtotal) ?? items.reduce((s, it) => s + it.precio * it.cantidad, 0),
    total: asNumber(totales.total) ?? 0,
    iva21: asNumber(iva1.impuesto) ?? 0,
    iva105: asNumber(iva3.impuesto) ?? 0,
    ii: asNumber(ii.impuesto) ?? 0,
    dropEntregaId: asString(rec.drop_entrega_id) || "0",
    raw: rec,
  };
}

/**
 * Portal 2025 de Air (www.air-intra.com) — el mismo login cookie que el
 * adapter CSV. El canasto es GET canasto.php?q=... (NV), no la API JSON v2.
 */
export class AirPortalClient {
  constructor(
    private readonly cookie: string,
    private readonly sesionId?: string
  ) {}

  static async login(credentials: Record<string, string>): Promise<AirPortalClient> {
    const { user, pass } = parseAirCredentials(credentials);
    let sessionCookie: string | undefined;
    try {
      const loginRes = await axios.post(
        AIR_PORTAL_URL,
        new URLSearchParams({ urbid: user, urbpass: pass, p: "", from: "" }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 20_000,
          maxRedirects: 0,
          validateStatus: (s) => s < 400 || s === 302,
        }
      );
      sessionCookie = cookieFrom(loginRes);
    } catch (err) {
      throw new BadGatewayException(`No se pudo iniciar sesión en el portal de Air: ${axiosErrorMessage(err, "error")}`);
    }
    if (!sessionCookie) {
      throw new BadGatewayException("Air no devolvió cookie de sesión — ¿usuario/clave incorrectos?");
    }
    let sesionId: string | undefined;
    try {
      const ui = await axios.get<string>(AIR_CANASTO_UI_URL, {
        headers: { Cookie: sessionCookie },
        timeout: 20_000,
        responseType: "text",
        validateStatus: (s) => s < 500,
      });
      sesionId = ui.data.match(/<meta\s+name=["']sesion_id["']\s+content=["']([^"']+)["']/i)?.[1];
    } catch {
      sesionId = undefined;
    }
    return new AirPortalClient(sessionCookie, sesionId);
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Cookie: this.cookie,
      Accept: "*/*",
      ...(this.sesionId ? { sesion_id: this.sesionId } : {}),
      ...extra,
    };
  }

  async getText(url: string): Promise<string> {
    try {
      const res = await axios.get<string>(url, {
        headers: this.headers(),
        timeout: 25_000,
        responseType: "text",
        maxRedirects: 0,
        validateStatus: (s) => s < 400 || s === 302,
      });
      if (res.status === 302) {
        throw new BadRequestException("La sesión de Air expiró");
      }
      return typeof res.data === "string" ? res.data : String(res.data ?? "");
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadGatewayException(`Air GET ${url} falló: ${axiosErrorMessage(err, "error")}`);
    }
  }

  async canasto(q: string, params: Record<string, string | number> = {}, base = AIR_CANASTO_URL): Promise<unknown> {
    const search = new URLSearchParams({ q });
    for (const [k, v] of Object.entries(params)) search.set(k, String(v));
    const url = `${base}?${search.toString()}`;
    const config: AxiosRequestConfig = {
      method: "GET",
      url,
      headers: this.headers(),
      timeout: 25_000,
      validateStatus: (s) => s < 500,
    };
    try {
      const res = await axios.request(config);
      if (res.status === 402) {
        throw new BadRequestException("La sesión de Air expiró");
      }
      if (res.status >= 400) {
        const msg = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? res.statusText);
        throw new BadGatewayException(`Air canasto ${q} → ${res.status}: ${String(msg).slice(0, 400)}`);
      }
      if (typeof res.data === "string") {
        const trimmed = res.data.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            return JSON.parse(trimmed) as unknown;
          } catch {
            return res.data;
          }
        }
        return res.data;
      }
      return res.data;
    } catch (err) {
      if (err instanceof BadGatewayException || err instanceof BadRequestException) throw err;
      throw new BadGatewayException(`Air canasto ${q} falló: ${axiosErrorMessage(err, "error")}`);
    }
  }

  async getPedido(nrocompro = "0"): Promise<AirCart> {
    return parseCart(await this.canasto("get_pedido", { nrocompro }));
  }

  async addItem(codiart: string, cantidad: number, nrocompro: string): Promise<AirCart> {
    return parseCart(await this.canasto("add_item", {
      codiart,
      cantidad,
      nrocompro,
      eq_renglon: -1,
      id_promo: "",
    }));
  }

  async delItem(renglon: number, nrocompro: string): Promise<AirCart> {
    return parseCart(await this.canasto("del_item", { renglon, nrocompro }));
  }

  async setPrefer(campo: string, valor: string, nrocompro: string): Promise<void> {
    await this.canasto("set_prefer", { campo, valor, nrocompro });
  }

  async sendPedido(nrocompro: string): Promise<unknown> {
    return this.canasto("send_pedido", { nrocompro });
  }

  async sendPedidoDirecto(nrocompro: string, sucursal: string, autodispo = "O"): Promise<unknown> {
    return this.canasto("send_pedido", { nrocompro, sucursal, autodispo }, AIR_CANASTO_DIRECTO_URL);
  }

  async checkoutOptions(): Promise<{
    sucursales: { value: string; label: string }[];
    vendedores: { value: string; label: string }[];
    pagos: { value: string; label: string }[];
    entregas: { value: string; label: string }[];
    transportes: { value: string; label: string }[];
  }> {
    let html = "";
    try {
      html = await this.getText(AIR_CANASTO_UI_URL);
    } catch {
      html = "";
    }
    const vendedores = parseSelectOptions(html, "vendedor").filter((o) => o.value);
    const transportes = parseSelectOptions(html, "transporte").filter((o) => o.value);
    const sucursales = parseSelectOptions(html, "sucursal").filter((o) => o.value);
    return {
      sucursales: sucursales.length > 0 ? sucursales : AIR_BRANCHES,
      vendedores,
      pagos: AIR_PAYMENTS,
      entregas: AIR_DELIVERIES,
      transportes,
    };
  }
}

export { parseCart as parseAirCart };
