import { errorText, isPostgresStarting } from "../prisma/postgres-starting";
import type { DbHealthStatus } from "../prisma/recovery-gate";

/** Clasifica el resultado de un ping a Postgres para /health. */
export function classifyDbPing(err: unknown | null): DbHealthStatus {
  if (err == null) return "ok";
  const text = errorText(err);
  if (isPostgresStarting(text) || /timeout/i.test(text)) return "waiting";
  return "down";
}
