import { BadGatewayException, BadRequestException } from "@nestjs/common";
import axios, { type AxiosInstance } from "axios";
import { asRecord, asString, axiosErrorMessage } from "./json-value";

export const SOLUTION_BOX_SITE = "https://www.solutionbox.com.ar";
export const SOLUTION_BOX_API = `${SOLUTION_BOX_SITE}/api`;
export const SOLUTION_BOX_IMAGE_BASE = `${SOLUTION_BOX_SITE}/articulos/thumbs/`;
const TIMEOUT_MS = 60_000;

export interface SolutionBoxCredentials {
  email?: string;
  password?: string;
}

export function parseSolutionBoxCredentials(raw: Record<string, string>): SolutionBoxCredentials {
  const email = (raw.email || raw.user || raw.username || raw.usuario || "").trim();
  const password = (raw.password || raw.pass || "").trim();
  return { email: email || undefined, password: password || undefined };
}

export function hasSolutionBoxLogin(creds: SolutionBoxCredentials): boolean {
  return Boolean(creds.email && creds.password);
}

/** Datos del cliente que devuelve GET /api/clientes con el token de sesión. */
export interface SolutionBoxCustomer {
  /** Id del usuario web (va en el carrito: ?user=). */
  userId: number;
  /** Número de cliente (va en pedidos: /ordenes/cliente/). */
  customerId: number;
  name: string;
  lastName: string;
  email: string;
  companyName: string;
  cuit: string;
  phone: string;
  paymentCondition: { code: string; label: string } | null;
  deliveryType: { code: string; label: string } | null;
  billingAddress: { street: string; city: string; postalCode: string; provinceCode: string; country: string };
  deliveryAddress: { street: string; city: string; postalCode: string; provinceCode: string; country: string };
  exchange: number | null;
  raw: unknown;
}

function codeLabel(value: unknown): { code: string; label: string } | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const code = asString(rec.Codigo) ?? "";
  const label = asString(rec.Descripcion) ?? "";
  return code || label ? { code, label } : null;
}

function address(value: unknown) {
  const rec = asRecord(value) ?? {};
  const prov = asRecord(rec.Provincia);
  return {
    street: asString(rec.Domicilio) ?? "",
    city: asString(rec.Localidad) ?? "",
    postalCode: asString(rec.Codigo_postal) ?? "",
    provinceCode: asString(rec.Codigo_Prov) ?? asString(prov?.Codigo) ?? "",
    country: asString(rec.Pais) ?? "AR",
  };
}

export function mapSolutionBoxCustomer(body: unknown): SolutionBoxCustomer {
  const rec = asRecord(body) ?? {};
  const c = asRecord(rec.cliente) ?? rec;
  const cot = c.Cotizacion;
  const exchange = typeof cot === "number" ? cot : Number(asString(cot) ?? "");
  return {
    userId: Number(c.Id ?? 0),
    customerId: Number(c.Cliente ?? 0),
    name: asString(c.Nombre) ?? "",
    lastName: asString(c.Apellido) ?? "",
    email: asString(c.Email) ?? "",
    companyName: asString(c.NomCliente) ?? "",
    cuit: asString(c.Cuit) ?? "",
    phone: asString(asRecord(c.Domicilio_facturacion)?.Telefono) ?? "",
    paymentCondition: codeLabel(c.Condicion_Pago),
    deliveryType: codeLabel(c.Tipo_entrega),
    billingAddress: address(c.Domicilio_facturacion),
    deliveryAddress: address(c.Domicilio_entrega),
    exchange: Number.isFinite(exchange) && exchange > 0 ? exchange : null,
    raw: body,
  };
}

/**
 * API interna del sitio www.solutionbox.com.ar (la misma que usa su tienda React),
 * confirmada en vivo con la sesión del cliente:
 * - POST /api/session/login { email, password } → { token } (JWT, va como Bearer).
 * - GET  /api/clientes → datos del cliente, condición de pago y tipo de entrega.
 * - GET  /api/articulos/categorias · /info/categoria/:code?limit&offset[&Stock=1] · /detalle?sku=
 * - POST /api/pedidos/proforma { precompra } → totales (IVA, percepción IIBB, cotización).
 * - POST /api/checkout/pedido/success { precompra, cliente } → crea el pedido.
 * - GET  /api/pedidos/ordenes/cliente/:id?Limit&Offset · /orden/:nro/:ext · /orden/factura/:nro/:ext (PDF).
 */
export class SolutionBoxWebClient {
  private readonly http: AxiosInstance;

  private constructor(
    readonly token: string,
    readonly customer: SolutionBoxCustomer
  ) {
    this.http = axios.create({
      baseURL: SOLUTION_BOX_API,
      timeout: TIMEOUT_MS,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      validateStatus: (s) => s < 500,
    });
  }

  static async login(credentials: Record<string, string>): Promise<SolutionBoxWebClient> {
    const creds = parseSolutionBoxCredentials(credentials);
    if (!hasSolutionBoxLogin(creds)) {
      throw new BadGatewayException("Para Solution Box hacen falta el mail y la contraseña de www.solutionbox.com.ar");
    }
    let token: string | undefined;
    try {
      const res = await axios.post(`${SOLUTION_BOX_API}/session/login`, { email: creds.email, password: creds.password }, {
        timeout: TIMEOUT_MS,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 401 || res.status === 403 || res.status === 400) {
        throw new BadRequestException("Mail o contraseña de Solution Box incorrectos");
      }
      if (res.status >= 400) throw new BadGatewayException(`Solution Box login → HTTP ${res.status}`);
      const rec = asRecord(res.data) ?? {};
      token = asString(rec.token) ?? asString(asRecord(rec.data)?.token) ?? asString(rec.accessToken);
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(`No se pudo iniciar sesión en Solution Box: ${axiosErrorMessage(err, "error")}`);
    }
    if (!token) throw new BadGatewayException("Solution Box no devolvió token de sesión");
    const probe = axios.create({
      baseURL: SOLUTION_BOX_API,
      timeout: TIMEOUT_MS,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    let customer: SolutionBoxCustomer;
    try {
      customer = mapSolutionBoxCustomer((await probe.get("/clientes")).data);
    } catch (err) {
      throw new BadGatewayException(`Solution Box no devolvió los datos del cliente: ${axiosErrorMessage(err, "error")}`);
    }
    if (!customer.customerId) throw new BadGatewayException("Solution Box no informó el número de cliente");
    return new SolutionBoxWebClient(token, customer);
  }

  async get<T = unknown>(path: string, params?: Record<string, unknown>): Promise<T> {
    try {
      const res = await this.http.get<T>(path, { params });
      if (res.status === 401) throw new BadGatewayException("La sesión de Solution Box expiró");
      if (res.status === 429) throw new BadGatewayException("Solution Box limitó los pedidos (429): esperá unos minutos");
      if (res.status >= 400) throw new BadGatewayException(`Solution Box ${path} → HTTP ${res.status}`);
      return res.data;
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(`Solution Box ${path} falló: ${axiosErrorMessage(err, "error")}`);
    }
  }

  async post<T = unknown>(path: string, body: unknown, params?: Record<string, unknown>): Promise<{ status: number; data: T }> {
    try {
      const res = await this.http.post<T>(path, body, { params });
      if (res.status === 401) throw new BadGatewayException("La sesión de Solution Box expiró");
      if (res.status === 429) throw new BadGatewayException("Solution Box limitó los pedidos (429): esperá unos minutos");
      return { status: res.status, data: res.data };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(`Solution Box ${path} falló: ${axiosErrorMessage(err, "error")}`);
    }
  }

  async delete(path: string, params?: Record<string, unknown>): Promise<void> {
    try {
      await this.http.delete(path, { params });
    } catch (err) {
      throw new BadGatewayException(`Solution Box ${path} falló: ${axiosErrorMessage(err, "error")}`);
    }
  }

  async getBuffer(path: string): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      const res = await this.http.get<ArrayBuffer>(path, { responseType: "arraybuffer" });
      if (res.status >= 400) throw new BadGatewayException(`Solution Box ${path} → HTTP ${res.status}`);
      return { buffer: Buffer.from(res.data), contentType: String(res.headers["content-type"] ?? "application/octet-stream") };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(`No se pudo descargar el documento de Solution Box: ${axiosErrorMessage(err, "error")}`);
    }
  }
}
