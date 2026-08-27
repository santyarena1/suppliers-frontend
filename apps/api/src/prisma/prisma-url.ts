const DEFAULT_LIMIT = 8;
const DEFAULT_POOL_TIMEOUT = 20;

/**
 * Prisma abre `num_cpus * 2 + 1` conexiones por defecto. En Railway eso se
 * duplica en el rolling deploy (instancia vieja + nueva) y Postgres responde
 * `FATAL: sorry, too many clients already`.
 */
export function withPrismaPool(url: string, opts?: { limit?: number; poolTimeout?: number }): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const qIndex = trimmed.indexOf("?");
  const base = qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed;
  const params = new URLSearchParams(qIndex >= 0 ? trimmed.slice(qIndex + 1) : "");
  if (!params.has("connection_limit")) {
    const fromEnv = Number(process.env.PRISMA_CONNECTION_LIMIT);
    params.set(
      "connection_limit",
      String(opts?.limit ?? (Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_LIMIT))
    );
  }
  if (!params.has("pool_timeout")) {
    params.set("pool_timeout", String(opts?.poolTimeout ?? DEFAULT_POOL_TIMEOUT));
  }
  return `${base}?${params.toString()}`;
}
