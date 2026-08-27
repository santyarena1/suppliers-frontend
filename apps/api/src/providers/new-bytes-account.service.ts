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
  normalizeOrderDetail,
  normalizeOrderRow,
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

  async getOrderDetail(credentials: Record<string, string>, id: string, kind?: string) {
    if (!id?.trim()) throw new BadRequestException("Falta id");
    const api = await this.client(credentials);
    const encoded = encodeURIComponent(id.trim());
    const purchaseFirst = kind === "purchase";
    const paths = purchaseFirst
      ? [`miCuenta/ordenesDeCompra/${encoded}`, `miCuenta/pedidos/${encoded}`]
      : [`miCuenta/pedidos/${encoded}`, `miCuenta/ordenesDeCompra/${encoded}`];
    for (const path of paths) {
      try {
        const body = await api.get(path);
        return { found: true as const, ...normalizeOrderDetail(body) };
      } catch {
        /* probar el otro recurso */
      }
    }
    return { found: false as const };
  }
}
