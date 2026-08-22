import { Prisma } from "@prisma/client";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function unwrapList<T = unknown>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const rec = asRecord(body);
  if (!rec) return [];
  for (const key of ["data", "items", "results", "resultado", "rows", "orders", "movimientos", "comprobantes"]) {
    const value = rec[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

export function snapshotJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function axiosErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "isAxiosError" in err) {
    const ax = err as { response?: { data?: unknown; status?: number }; message?: string };
    const data = ax.response?.data;
    const fromBody =
      typeof data === "string"
        ? data
        : asString(asRecord(data)?.message) || asString(asRecord(data)?.error_desc) || (data ? JSON.stringify(data) : undefined);
    return (fromBody || ax.message || fallback).slice(0, 400);
  }
  return (err instanceof Error ? err.message : String(err) || fallback).slice(0, 400);
}
