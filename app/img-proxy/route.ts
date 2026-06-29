import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const trim = req.nextUrl.searchParams.get("trim") !== "0";
  if (!url) return new NextResponse("Missing url", { status: 400 });

  try {
    const decoded = decodeURIComponent(url);
    const target = new URL(decoded);
    if (!["http:", "https:"].includes(target.protocol)) {
      return new NextResponse("Invalid protocol", { status: 400 });
    }

    const res = await fetch(target.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SuppliersBot/1.0)",
        Accept: "image/*,*/*;q=0.8",
      },
      cache: "force-cache",
    });

    if (!res.ok) return new NextResponse("Upstream error", { status: res.status });

    const buf = Buffer.from(await res.arrayBuffer());

    if (!trim) {
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
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
          "content-type": "image/webp",
          "cache-control": "public, max-age=86400, immutable",
        },
      });
    } catch {
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "content-type": res.headers.get("content-type") || "image/jpeg",
          "cache-control": "public, max-age=86400, immutable",
        },
      });
    }
  } catch {
    return new NextResponse("Fetch failed", { status: 500 });
  }
}
