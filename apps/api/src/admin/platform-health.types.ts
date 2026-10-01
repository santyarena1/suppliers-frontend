export type HealthStatus = "ok" | "warn" | "error" | "info";

export type HealthGroup =
  | "platform"
  | "crons"
  | "retail"
  | "catalog"
  | "images"
  | "imports"
  | "frontend";

export interface HealthCheck {
  id: string;
  group: HealthGroup;
  label: string;
  status: HealthStatus;
  message: string;
  detail?: Record<string, unknown>;
  /** Ruta del front para ir al tab relacionado. */
  href?: string;
}

export interface PlatformHealthOverview {
  checkedAt: string;
  summary: { ok: number; warn: number; error: number; info: number };
  checks: HealthCheck[];
  clientErrors: {
    lastHour: number;
    last24h: number;
  };
}
