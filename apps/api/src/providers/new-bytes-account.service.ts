import { BadGatewayException, Injectable } from "@nestjs/common";
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
  pickBalanceFromClient,
  type NbComprobanteRow,
  type NbOrderRow,
} from "./new-bytes.mapper";

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
    const rows = await api.paginate("miCuenta/pedidos", 20, 200);
    return { orders: rows.map(normalizeOrderRow) };
  }

  /** Órdenes de compra (las que crea el checkout) — GET miCuenta/ordenesDeCompra. */
  async getPurchaseOrders(credentials: Record<string, string>): Promise<{ orders: NbOrderRow[] }> {
    const api = await this.client(credentials);
    const rows = await api.paginate("miCuenta/ordenesDeCompra", 20, 200);
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
      api.paginate("miCuenta/comprobantes", 20, 200),
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
}
