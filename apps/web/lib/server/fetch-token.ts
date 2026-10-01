import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Los proxies de egreso (/api/*-fetch) solo los usa el backend de NODO. Sin
 * token configurado no atienden a nadie: un proxy que deja pasar "porque falta
 * la variable" es un relay abierto para cualquiera en internet.
 */
export function fetchTokenOk(req: NextRequest, ...envNames: string[]): boolean {
  const expected = envNames.map((n) => (process.env[n] || "").trim()).find(Boolean) ?? "";
  if (!expected) return false;
  const got = req.headers.get("x-nodo-fetch-token") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
