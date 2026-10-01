import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { BlockedUrlError, publicFetch } from "@/lib/server/public-fetch";

/** Una imagen de producto no pesa más que esto; lo demás no es una imagen. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Lo que sale de acá es una imagen y nada más: aunque alguien la abra directo,
 * el navegador no ejecuta nada ni adivina otro tipo de contenido.
 */
const SAFE_HEADERS = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; sandbox",
};

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const trim = req.nextUrl.searchParams.get("trim") !== "0";
  if (!url) return new NextResponse("Missing url", { status: 400 });

  try {
    const decoded = decodeURIComponent(url);
    // Solo internet pública: nada de localhost, red interna ni metadata de la nube.
    const res = await publicFetch(decoded, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NodoBot/1.0)",
        Accept: "image/*,*/*;q=0.8",
      },
      cache: "force-cache",
    });

    if (!res.ok) return new NextResponse("Upstream error", { status: res.status });
    // Es un proxy de imágenes: cualquier otra cosa (HTML, JSON, binarios) no pasa.
    const type = (res.headers.get("content-type") || "").toLowerCase();
    // SVG puede traer scripts: no se sirve desde nuestro dominio.
    if (type.includes("svg") || (type && !type.startsWith("image/") && !type.startsWith("application/octet-stream"))) {
      return new NextResponse("Not an image", { status: 415 });
    }
    if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) {
      return new NextResponse("Too large", { status: 413 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return new NextResponse("Too large", { status: 413 });

    if (!trim) {
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          ...SAFE_HEADERS,
          "content-type": res.headers.get("content-type") || "image/jpeg",
          "cache-control": "public, max-age=86400, immutable",
        },
      });
    }

    try {
      const trimmed = await sharp(buf)
        .trim({ threshold: 18 })
        .extend({ top: 24, bottom: 24, left: 24, right: 24, background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .toFormat("webp", { quality: 88 })
        .toBuffer();

      return new NextResponse(new Uint8Array(trimmed), {
        status: 200,
        headers: {
          ...SAFE_HEADERS,
          "content-type": "image/webp",
          "cache-control": "public, max-age=86400, immutable",
        },
      });
    } catch {
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          ...SAFE_HEADERS,
          "content-type": res.headers.get("content-type") || "image/jpeg",
          "cache-control": "public, max-age=86400, immutable",
        },
      });
    }
  } catch (err) {
    if (err instanceof BlockedUrlError) return new NextResponse("Blocked", { status: 400 });
    return new NextResponse("Fetch failed", { status: 502 });
  }
}
