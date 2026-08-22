import { BadGatewayException, Injectable } from "@nestjs/common";
import axios from "axios";
import { decodeEntities, parseOrdersTable } from "./invid-order.parser";

const SITE_BASE = "https://www.invidcomputers.com";
const LOGIN_URL = `${SITE_BASE}/login.php`;

/**
 * Lectura de datos reales de la cuenta de Invid (pedidos y cuenta
 * corriente) — solo GET, nunca escribe ni cambia nada en Invid. Mismo
 * patrón de login que el resto de los adapters de Invid.
 */
@Injectable()
export class InvidAccountService {
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

  /** Historial real de pedidos — GET/lectura, no confirma ni modifica nada. */
  async getOrders(credentials: Record<string, string>) {
    const { username, password } = credentials;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");
    const cookie = await this.login(username, password);

    const res = await axios.get<string>(`${SITE_BASE}/lista_pedidos_invid.php`, {
      headers: { Cookie: cookie },
      timeout: 20_000,
      responseType: "text",
    });
    return parseOrdersTable(res.data);
  }

  /** Saldo y movimientos reales de cuenta corriente — GET/lectura. */
  async getAccountStatement(credentials: Record<string, string>) {
    const { username, password } = credentials;
    if (!username || !password) throw new BadGatewayException("Credenciales de Invid incompletas");
    const cookie = await this.login(username, password);

    const res = await axios.get<string>(`${SITE_BASE}/lista_ctacte_invid.php`, {
      headers: { Cookie: cookie },
      timeout: 20_000,
      responseType: "text",
    });
    return parseAccountStatement(res.data);
  }
}

function parseAccountStatement(html: string) {
  // Formato real: "Saldo de Cuenta Corriente: $-66622.38" — punto decimal
  // directo, sin separador de miles en el encabezado (a diferencia de la
  // tabla de abajo, que sí puede traer comas como separador de miles).
  const balanceMatch = html.match(/Saldo de Cuenta Corriente:\s*\$?\s*(-?[\d,]+\.?\d*)/i);
  const balance = balanceMatch ? Number(balanceMatch[1].replace(/,/g, "")) : null;

  const movements: { date: string; docType: string; docNumber: string; internalNumber: string; currency: string; total: string }[] = [];
  // Fila real: <tr class="CartProduct" id="trN"><td class="valorizar">fecha</td>
  // <td class="text-center">tipo</td><td class="text-center">numero</td>
  // <td class="text-center">interno</td><td class="text-center">moneda</td>
  // <td align="right" class="text-right">total</td></tr>
  const rowRe =
    /<tr class="CartProduct"[^>]*>\s*<td class="valorizar">\s*([\d-]+)\s*<\/td>\s*<td class="text-center">\s*([^<]*?)\s*<\/td>\s*<td class="text-center">\s*([^<]*?)\s*<\/td>\s*<td class="text-center">\s*([^<]*?)\s*<\/td>\s*<td class="text-center">\s*([^<]*?)\s*<\/td>\s*<td[^>]*class="text-right"[^>]*>\s*([^<]*?)\s*<\/td>\s*<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    movements.push({
      date: m[1].trim(),
      docType: decodeEntities(m[2].trim()),
      docNumber: m[3].trim(),
      internalNumber: m[4].trim(),
      currency: m[5].trim(),
      total: decodeEntities(m[6].trim()),
    });
  }
  return { balance, movements };
}
