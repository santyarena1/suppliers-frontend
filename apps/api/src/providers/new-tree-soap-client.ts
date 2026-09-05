import { BadGatewayException, BadRequestException } from "@nestjs/common";
import axios from "axios";
import { axiosErrorMessage } from "./json-value";

/**
 * SOAP de GlobalBluePoint para New Tree ("API articulos - CLIENTE"):
 * - Header `wsERPConnectHeader` { pUsername, pPassword, pCompany, pWebWervice (sic), pAuthenticatedToken }.
 * - `AuthenticateUser` → token; `wsGBPScriptExecute(strScriptLabel="getArticulos",
 *   strJSonParameters='{"client_id":N}')` → JSON con el catálogo.
 * Solo cubre catálogo. Pedidos y cuenta corriente siguen por el portal.
 */
export const NEW_TREE_SOAP_URL = "https://ws.globalbluepoint.com/newtree/app_webservices/wserpconnect.asmx";
const SOAP_NS = "http://tempuri.org/";
const TIMEOUT_MS = 120_000;

export interface NewTreeApiCredentials {
  username: string;
  password: string;
  company: number;
  webService: number;
  clientId: number;
}

export function parseNewTreeApiCredentials(raw: Record<string, string>): NewTreeApiCredentials | null {
  const username = (raw.api_username || raw.apiUser || raw.PUSERNAME || "").trim();
  const password = (raw.api_password || raw.apiPassword || raw.PPASSWORD || "").trim();
  const company = Number((raw.company || raw.PCOMPANY || "").trim());
  const webService = Number((raw.webservice || raw.web_service || raw.PWEBSERVICE || "").trim());
  const clientId = Number((raw.client_id || raw.clientId || "").trim());
  if (!username || !password) return null;
  if (![company, webService, clientId].every((n) => Number.isInteger(n) && n > 0)) return null;
  return { username, password, company, webService, clientId };
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

export function buildEnvelope(
  op: string,
  creds: Omit<NewTreeApiCredentials, "clientId">,
  token: string | null,
  body: Record<string, string> = {}
): string {
  const params = Object.entries(body)
    .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<soap:Header><wsERPConnectHeader xmlns="${SOAP_NS}">` +
    `<pUsername>${escapeXml(creds.username)}</pUsername>` +
    `<pPassword>${escapeXml(creds.password)}</pPassword>` +
    `<pCompany>${creds.company}</pCompany>` +
    `<pWebWervice>${creds.webService}</pWebWervice>` +
    (token ? `<pAuthenticatedToken>${escapeXml(token)}</pAuthenticatedToken>` : "") +
    `</wsERPConnectHeader></soap:Header>` +
    `<soap:Body><${op} xmlns="${SOAP_NS}">${params}</${op}></soap:Body></soap:Envelope>`
  );
}

/** Texto del `<OpResult>` de la respuesta SOAP, ya sin entidades XML. `null` si no está. */
export function extractResult(xml: string, op: string): string | null {
  const m = xml.match(new RegExp(`<${op}Result[^>]*>([\\s\\S]*?)</${op}Result>`, "i"));
  if (m) return decodeXml(m[1]);
  if (new RegExp(`<${op}Result[^>]*/>`, "i").test(xml)) return "";
  return null;
}

export function extractFault(xml: string): string | null {
  const m = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  return m ? decodeXml(m[1]).replace(/\s+/g, " ").trim() : null;
}

const TOKEN_LOOKS_VALID = /^[A-Za-z0-9-]{8,}$/;

export class NewTreeSoapClient {
  private constructor(
    private readonly creds: NewTreeApiCredentials,
    readonly token: string
  ) {}

  static async authenticate(credentials: Record<string, string>): Promise<NewTreeSoapClient> {
    const creds = parseNewTreeApiCredentials(credentials);
    if (!creds) {
      throw new BadGatewayException(
        "Para la API de New Tree hacen falta usuario, contraseña, company, web service y client_id (los da New Tree)."
      );
    }
    const token = await NewTreeSoapClient.call("AuthenticateUser", creds, null);
    const clean = (token ?? "").trim();
    if (!TOKEN_LOOKS_VALID.test(clean) || clean === "-1") {
      throw new BadRequestException(`New Tree no aceptó las credenciales de la API${clean ? ` (${clean.slice(0, 120)})` : ""}`);
    }
    return new NewTreeSoapClient(creds, clean);
  }

  /** Ejecuta un script del ERP y devuelve el string crudo (normalmente JSON). */
  async executeScript(label: string, parameters: Record<string, unknown>): Promise<string> {
    const result = await NewTreeSoapClient.call("wsGBPScriptExecute", this.creds, this.token, {
      strScriptLabel: label,
      strJSonParameters: JSON.stringify(parameters),
    });
    return result ?? "";
  }

  async getArticulos(): Promise<unknown[]> {
    const raw = await this.executeScript("getArticulos", { client_id: this.creds.clientId });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadGatewayException(`New Tree getArticulos no devolvió JSON: ${raw.slice(0, 200)}`);
    }
    if (Array.isArray(parsed)) return parsed;
    const rec = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    for (const key of ["data", "articulos", "items", "result"]) {
      if (rec && Array.isArray(rec[key])) return rec[key] as unknown[];
    }
    throw new BadGatewayException(`New Tree getArticulos devolvió un formato inesperado: ${raw.slice(0, 200)}`);
  }

  private static async call(
    op: string,
    creds: Omit<NewTreeApiCredentials, "clientId">,
    token: string | null,
    body: Record<string, string> = {}
  ): Promise<string | null> {
    let xml: string;
    try {
      const res = await axios.post<string>(NEW_TREE_SOAP_URL, buildEnvelope(op, creds, token, body), {
        timeout: TIMEOUT_MS,
        responseType: "text",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${SOAP_NS}${op}"` },
        validateStatus: (s) => s < 600,
        maxContentLength: 200 * 1024 * 1024,
      });
      xml = res.data;
      if (res.status >= 400) {
        const fault = extractFault(xml);
        throw new BadGatewayException(`New Tree SOAP ${op} → HTTP ${res.status}${fault ? `: ${fault}` : ""}`);
      }
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(`New Tree SOAP ${op} falló: ${axiosErrorMessage(err, "error")}`);
    }
    const fault = extractFault(xml);
    if (fault) throw new BadGatewayException(`New Tree SOAP ${op}: ${fault}`);
    return extractResult(xml, op);
  }
}
