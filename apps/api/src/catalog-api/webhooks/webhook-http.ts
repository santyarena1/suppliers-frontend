import axios from "axios";
import http from "http";
import https from "https";
import { assertWebhookUrl, safeLookup } from "./ssrf";
import { signPayload } from "./webhook-signature";

export const WEBHOOK_TIMEOUT_MS = 10_000;
/** De la respuesta del integrador se guarda solo el principio (para el historial). */
const MAX_ERROR_LENGTH = 300;

const httpAgent = new http.Agent({ lookup: safeLookup, keepAlive: false });
const httpsAgent = new https.Agent({ lookup: safeLookup, keepAlive: false });

export interface DeliveryAttempt {
  ok: boolean;
  status: number | null;
  error: string | null;
}

/**
 * Manda una entrega firmada. Sin redirecciones (un 3xx es un fallo: así una URL
 * pública no puede rebotar a una interna) y con timeout de 10 s.
 */
export async function postWebhook(input: {
  url: string;
  secret: string;
  eventId: string;
  type: string;
  body: string;
  now?: number;
}): Promise<DeliveryAttempt> {
  let url: URL;
  try {
    url = assertWebhookUrl(input.url);
  } catch (err) {
    return { ok: false, status: null, error: (err as Error).message };
  }
  const timestamp = Math.floor((input.now ?? Date.now()) / 1000);
  try {
    const res = await axios.post(url.toString(), input.body, {
      timeout: WEBHOOK_TIMEOUT_MS,
      maxRedirects: 0,
      httpAgent,
      httpsAgent,
      proxy: false,
      validateStatus: () => true,
      responseType: "text",
      maxContentLength: 64 * 1024,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "NODO-Webhooks/1.0 (+https://nodohub.app/developers)",
        "Nodo-Signature": signPayload(input.secret, input.body, timestamp),
        "Nodo-Event-Id": input.eventId,
        "Nodo-Event-Type": input.type,
      },
    });
    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      status: res.status,
      error: ok ? null : `HTTP ${res.status}: ${String(res.data ?? "").slice(0, MAX_ERROR_LENGTH)}`,
    };
  } catch (err) {
    const message = (err as { code?: string; message?: string }).code === "ECONNABORTED" ? "Tiempo de espera agotado (10 s)" : (err as Error).message;
    return { ok: false, status: null, error: message.slice(0, MAX_ERROR_LENGTH) };
  }
}
