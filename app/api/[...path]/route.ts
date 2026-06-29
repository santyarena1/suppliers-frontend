import { NextRequest, NextResponse } from "next/server";

const API_TARGET = process.env.API_TARGET || "https://suppliersapi-g3je.onrender.com";

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const search = req.nextUrl.search || "";
  const url = `${API_TARGET}/${path.join("/")}${search}`;

  // Forward auth + content-type ONLY. No Origin / Referer / Host.
  const headers = new Headers();
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };

  if (!["GET", "HEAD"].includes(req.method)) {
    init.body = await req.text();
  }

  const res = await fetch(url, init);

  const respHeaders = new Headers();
  const respCT = res.headers.get("content-type");
  if (respCT) respHeaders.set("content-type", respCT);

  const body = await res.arrayBuffer();
  return new NextResponse(body, { status: res.status, headers: respHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
