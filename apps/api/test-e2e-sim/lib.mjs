// Helpers de la simulación E2E de un usuario nuevo de NODO contra el API local.
// No toca producción: BASE_URL y DATABASE_URL tienen que apuntar a local.
import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";

export const BASE_URL = process.env.SIM_BASE_URL ?? "http://127.0.0.1:8091";
export const LOG_PATH = process.env.SIM_API_LOG;

if (!/127\.0\.0\.1|localhost/.test(BASE_URL)) throw new Error("SIM_BASE_URL tiene que ser local");
if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) throw new Error("DATABASE_URL tiene que ser local");
if (!LOG_PATH) throw new Error("Falta SIM_API_LOG (log del API para leer los códigos de mail)");

/** Todos los 5xx que aparezcan, con request y respuesta. */
export const serverErrors = [];

/** Resultados por escenario. */
export const results = [];

const randomIp = () => `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;

/**
 * Llama al API. Cada pedido sale con una IP distinta (X-Real-IP) para no
 * chocar con el throttling por IP, que no es lo que se prueba acá.
 */
export async function api(method, path, { token, body, form, ip, raw } = {}) {
  const headers = { "x-real-ip": ip ?? randomIp() };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (raw !== undefined) {
    headers["content-type"] = "application/json";
    payload = raw;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { nonJson: text.slice(0, 300) };
  }
  const out = { status: res.status, body: json, data: json?.data, method, path };
  if (res.status >= 500) {
    serverErrors.push({
      request: `${method} ${path}`,
      requestBody: body ?? (form ? "[multipart]" : raw),
      status: res.status,
      response: json,
    });
  }
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** El código de verificación que el API escribió en el log (sin mail configurado). */
export async function codeFromLog(email, { after = 0, tries = 20 } = {}) {
  for (let i = 0; i < tries; i++) {
    const log = readFileSync(LOG_PATH, "utf8");
    const marker = `Destino ${email} `;
    const idx = log.lastIndexOf(marker);
    if (idx >= 0 && idx >= after) {
      const m = /confirmar el email es (\d{6})/.exec(log.slice(idx, idx + 600));
      if (m) return { code: m[1], at: idx };
    }
    await sleep(150);
  }
  return null;
}

export function logLength() {
  return readFileSync(LOG_PATH, "utf8").length;
}

/** Un escenario: junta chequeos PASA/FALLA con el request y la respuesta. */
export function scenario(id, title) {
  const s = { id, title, checks: [] };
  results.push(s);
  const short = (r) =>
    r && typeof r === "object" && "status" in r && "method" in r
      ? { request: `${r.method} ${r.path}`, status: r.status, response: truncate(r.body) }
      : r;
  s.check = (name, ok, evidence, extra = {}) => {
    s.checks.push({ name, ok: Boolean(ok), evidence: short(evidence), ...extra });
    const tag = ok ? "PASA " : "FALLA";
    console.log(`  [${tag}] ${id} · ${name}${ok ? "" : `  -> ${JSON.stringify(short(evidence)).slice(0, 400)}`}`);
    return Boolean(ok);
  };
  /** Hallazgo que no es pasa/falla de contrato sino comportamiento a revisar. */
  s.note = (text, evidence) => {
    s.checks.push({ name: text, ok: null, evidence: short(evidence) });
    console.log(`  [NOTA ] ${id} · ${text}`);
  };
  console.log(`\n== ${id}: ${title}`);
  return s;
}

function truncate(value) {
  const text = JSON.stringify(value);
  if (!text || text.length <= 700) return value;
  return `${text.slice(0, 700)}…`;
}

export const near = (a, b, toleranceMs) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= toleranceMs;
