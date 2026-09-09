import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Salida de red para el ingest de locales.
 *
 * HardGamers contesta 403 a la IP del servidor de la API (Railway) pero sí
 * responde a la de Vercel, que es infraestructura que ya tenemos. En vez de
 * pagar un proxy de terceros, el ingest pide la página por acá.
 *
 * Esto NO es un proxy abierto: solo deja pasar los hosts de la lista, y si hay
 * token configurado lo exige. Sin esas dos cosas seríamos un anonimizador
 * gratis colgado del dominio.
 */

const ALLOWED_HOSTS = new Set(["www.hardgamers.com.ar", "hardgamers.com.ar"]);

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Upgrade-Insecure-Requests": "1",
};

export async function GET(req: NextRequest) {
  const expected = (process.env.RETAIL_FETCH_TOKEN || "").trim();
  if (expected && req.headers.get("x-nodo-fetch-token") !== expected) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return new NextResponse("Missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(decodeURIComponent(raw));
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.host)) {
    return new NextResponse("Host no permitido", { status: 400 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { ...BROWSER_HEADERS, Referer: `https://${target.host}/` },
      cache: "no-store",
    });
    const body = await upstream.text();

    const headers = new Headers({
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    // El ingest usa estos para respetar el límite de la fuente.
    for (const h of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "retry-after"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new NextResponse(body, { status: upstream.status, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Upstream error: ${message}`, { status: 502 });
  }
}
