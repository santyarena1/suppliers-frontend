import { NextRequest, NextResponse } from "next/server";
import https from "https";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Railway no sale a api.distecna.com:8096 (timeout). Vercel sí puede, igual
 * que /api/retail-fetch para HardGamers. No es un proxy abierto: solo esos
 * hosts/puertos de Distecna, y el token si está configurado.
 */

const ALLOWED = new Set([
  "api.distecna.com:8096",
  "dsaapi.distecna.com:8087",
  "dsaapi.distecna.com:8088",
  "qa-apipublica.distecna.com:8086",
  "qa-apipublica.distecna.com:8088",
]);

function fetchTokenOk(req: NextRequest): boolean {
  const expected = (
    process.env.DISTECNA_FETCH_TOKEN ||
    process.env.RETAIL_FETCH_TOKEN ||
    process.env.RETAIL_HG_FETCH_TOKEN ||
    ""
  ).trim();
  if (!expected) return true;
  return req.headers.get("x-nodo-fetch-token") === expected;
}

function parseTarget(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function allowed(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const port = url.port || "443";
  return ALLOWED.has(`${url.hostname}:${port}`);
}

function forwardHeaders(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = { Accept: "application/json" };
  for (const name of ["x-apikey", "authorization", "content-type"]) {
    const v = req.headers.get(name);
    if (v) out[name] = v;
  }
  return out;
}

function upstream(
  target: URL,
  method: string,
  headers: Record<string, string>,
  body?: Buffer
): Promise<{ status: number; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: target.hostname,
        port: Number(target.port || 443),
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        rejectUnauthorized: false,
        family: 4,
        timeout: 40_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk as Buffer));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 502,
            contentType: String(res.headers["content-type"] || "application/json"),
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body && body.length) req.write(body);
    req.end();
  });
}

async function handle(req: NextRequest) {
  if (!fetchTokenOk(req)) return new NextResponse("Forbidden", { status: 403 });

  const target = parseTarget(req.nextUrl.searchParams.get("url"));
  if (!target) return new NextResponse("Missing url", { status: 400 });
  if (!allowed(target)) return new NextResponse("Host no permitido", { status: 400 });

  try {
    const method = req.method === "POST" || req.method === "PUT" ? req.method : "GET";
    const rawBody = method === "GET" ? undefined : Buffer.from(await req.arrayBuffer());
    const up = await upstream(target, method, forwardHeaders(req), rawBody);
    return new NextResponse(up.body, {
      status: up.status,
      headers: {
        "content-type": up.contentType,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Upstream error: ${message}`, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
