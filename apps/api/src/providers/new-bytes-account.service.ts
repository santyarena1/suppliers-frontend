import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  hasNbPortalLogin,
  NewBytesApiClient,
  parseNbCredentials,
  unwrapNbList,
  asRecord,
} from "./new-bytes-client";
import {
  normalizeComprobante,
  normalizeOrderRow,
  parseNbOrderItems,
  parseNbSubtotales,
  parseNbTracking,
  pickBalanceFromClient,
  type NbComprobanteRow,
  type NbOrderRow,
} from "./new-bytes.mapper";
import { documentFile } from "./document-file";

/**
 * Lectura de la cuenta real de NewBytes (pedidos, órdenes de compra y
 * comprobantes / cuenta corriente) — solo GET, nunca escribe.
 * Endpoints tomados del store Vuex `miCuenta` del sitio www.nb.com.ar.
 */
@Injectable()
export class NewBytesAccountService {
  private async client(credentials: Record<string, string>): Promise<NewBytesApiClient> {
    const creds = parseNbCredentials(credentials);
    if (!hasNbPortalLogin(creds)) {
      throw new BadGatewayException(
        "Para Pedidos/Cuenta Corriente de NewBytes hace falta user y password del portal (no el token de lista de precios)"
      );
    }
    return NewBytesApiClient.login(creds.user!, creds.password!);
  }

  async getProfile(credentials: Record<string, string>) {
    const api = await this.client(credentials);
    const [user, clientBody, misDatos] = await Promise.all([
      api.get("auth/user").catch(() => null),
      api.get("client").catch(() => null),
      api.get("miCuenta/misDatos").catch(() => null),
    ]);
    const clientList = unwrapNbList(clientBody);
    const client = clientList[0] ?? (asRecord(clientBody) && !Array.isArray(clientBody) ? clientBody : null);
    const rec = asRecord(client);
    const nestedData = rec && Array.isArray(rec.data) ? rec.data[0] : client;
    return {
      user,
      client: nestedData,
      misDatos,
      balance: pickBalanceFromClient(nestedData) ?? pickBalanceFromClient(user),
    };
  }

  /** Historial real de pedidos web — GET miCuenta/pedidos. */
  async getOrders(credentials: Record<string, string>): Promise<{ orders: NbOrderRow[] }> {
    const api = await this.client(credentials);
    const rows = await api.paginate("miCuenta/pedidos", 20, 60);
    return { orders: rows.map(normalizeOrderRow) };
  }

  /** Órdenes de compra (las que crea el checkout) — GET miCuenta/ordenesDeCompra. */
  async getPurchaseOrders(credentials: Record<string, string>): Promise<{ orders: NbOrderRow[] }> {
    const api = await this.client(credentials);
    const rows = await api.paginate("miCuenta/ordenesDeCompra", 20, 60);
    return { orders: rows.map(normalizeOrderRow) };
  }

  /** Comprobantes de la cuenta (facturas / Cta. Cte.) — GET miCuenta/comprobantes. */
  async getAccountStatement(credentials: Record<string, string>): Promise<{
    balance: number | null;
    movements: NbComprobanteRow[];
    profile: { user: unknown; client: unknown; misDatos: unknown; balance: number | null };
  }> {
    const api = await this.client(credentials);
    const [rows, user, clientBody, misDatos] = await Promise.all([
      api.paginate("miCuenta/comprobantes", 20, 60),
      api.get("auth/user").catch(() => null),
      api.get("client").catch(() => null),
      api.get("miCuenta/misDatos").catch(() => null),
    ]);
    const clientList = unwrapNbList(clientBody);
    const rec = asRecord(clientBody);
    const nestedData = clientList[0] ?? (rec && Array.isArray(rec.data) ? rec.data[0] : clientBody);
    const balance = pickBalanceFromClient(nestedData) ?? pickBalanceFromClient(user);
    return {
      balance,
      movements: rows.map(normalizeComprobante),
      profile: { user, client: nestedData, misDatos, balance },
    };
  }

  async getDocument(credentials: Record<string, string>, voucherId: string) {
    if (!voucherId?.trim()) throw new BadRequestException("Falta voucherId");
    const api = await this.client(credentials);
    const rows = await api.paginate("miCuenta/comprobantes", 20, 60);
    const found = rows.map(normalizeComprobante).find((r) => String(r.voucherId) === String(voucherId));
    const url = found?.voucherUrl;
    if (!url) throw new NotFoundException("Ese comprobante no tiene voucherUrl");
    const parsed = new URL(url, "https://api.nb.com.ar/v1/");
    if (!["api.nb.com.ar", "www.nb.com.ar", "static.nb.com.ar"].includes(parsed.hostname)) {
      throw new BadRequestException("URL de comprobante no permitida");
    }
    const file = await api.getBuffer(parsed.toString());
    return documentFile(file.buffer, file.contentType, `comprobante-${voucherId}`);
  }

  /**
   * Detalle de un pedido o una orden de compra, como lo arma www.nb.com.ar:
   * - pedido: GET miCuenta/pedidos/{sucursal}/{albarán} → líneas con producto,
   *   cantidad y precio (neto, % IVA, % internos, final).
   * - orden de compra: GET miCuenta/ordenesDeCompra/{sucursal}/{número} (líneas),
   *   …/tracking (seguimiento) y …/total (cotización y totales en USD y pesos).
   * El encabezado (estado, fecha, envío, usuario) sale de la fila del listado.
   * Sin sucursal se busca la fila en el listado para conocerla.
   */
  async getOrderDetail(credentials: Record<string, string>, id: string, kind?: string, branch?: string) {
    const number = id?.trim();
    if (!number) throw new BadRequestException("Falta id");
    const api = await this.client(credentials);
    const purchase = kind === "purchase";
    const resource = purchase ? "miCuenta/ordenesDeCompra" : "miCuenta/pedidos";

    // La web ya tiene la fila del listado y manda la sucursal; si no, se busca.
    const header = branch?.trim()
      ? undefined
      : (await api.paginate(resource, 20, 200)).map(normalizeOrderRow).find((row) =>
          purchase ? row.orderNumber === number : row.albNumber === number || row.orderNumber === number
        );
    const sucursal = branch?.trim() || (header?.branch != null ? String(header.branch) : "");
    if (!sucursal) return { found: false as const };

    const base = `${resource}/${encodeURIComponent(sucursal)}/${encodeURIComponent(number)}`;
    const [linesBody, trackingBody, totalBody] = await Promise.all([
      api.get(base).catch(() => null),
      purchase ? api.get(`${base}/tracking`).catch(() => null) : Promise.resolve(null),
      purchase ? api.get(`${base}/total`).catch(() => null) : Promise.resolve(null),
    ]);
    if (linesBody == null && !header) return { found: false as const };

    const items = linesBody != null ? parseNbOrderItems(linesBody) : [];
    const total = totalBody != null ? parseNbSubtotales(totalBody) : null;
    const detail: NbOrderRow = {
      ...(header ?? { orderNumber: number, branch: sucursal }),
      ...(items.length > 0 ? { items } : {}),
      ...(trackingBody != null && parseNbTracking(trackingBody).length > 0 ? { tracking: parseNbTracking(trackingBody) } : {}),
      // El total de la orden pisa el del listado: es el que New Bytes calcula al abrirla.
      ...(total?.subtotalUsd != null ? { subtotalUsd: total.subtotalUsd } : {}),
      ...(total?.totalUsd != null ? { totalUsd: total.totalUsd } : {}),
      ...(total?.totalArs != null ? { totalArs: total.totalArs } : {}),
      ...(total?.exchangeRate != null ? { exchangeRate: total.exchangeRate } : {}),
    };
    return { found: true as const, ...detail };
  }
}
