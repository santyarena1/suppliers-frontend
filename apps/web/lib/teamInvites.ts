import api, { type OnboardingStatus, type TenantRole } from "@/lib/api";

/** Códigos para sumarse al equipo de un comercio. Ver apps/api/src/tenants/team-invites.service.ts. */

export type TeamInviteStatus = "ACTIVE" | "EXPIRED" | "EXHAUSTED" | "REVOKED";

export interface TeamInvite {
  id: string;
  code: string;
  role: TenantRole;
  roleLabel: string;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  revoked: boolean;
  status: TeamInviteStatus;
  createdAt: string;
  /** Quién entró con este código. */
  usedBy?: { username: string; at: string }[];
}

export type TeamInvitePreview = { valid: false } | { valid: true; organizationName: string; roleLabel: string };

export const teamInvitesApi = {
  list: () => api.get<TeamInvite[]>("/my/team/invite-codes"),
  /** Las invitaciones no vencen: valen hasta que se usan o se anulan. */
  create: (data: { role: TenantRole; maxUses?: number | null }) =>
    api.post<TeamInvite>("/my/team/invite-codes", data),
  revoke: (id: string) => api.delete<{ id: string; revoked: true }>(`/my/team/invite-codes/${id}`),
  preview: (code: string) => api.get<TeamInvitePreview>(`/team-invites/${encodeURIComponent(code)}/preview`),
  join: (code: string) =>
    api.post<{
      tenantId: string;
      tenantName: string;
      role: TenantRole;
      roleLabel: string;
      token: string;
      onboarding: OnboardingStatus;
    }>("/onboarding/join-team", { code }),
};

export const TEAM_INVITE_STATUS_LABELS: Record<TeamInviteStatus, string> = {
  ACTIVE: "Activo",
  EXPIRED: "Vencido",
  EXHAUSTED: "Usado",
  REVOKED: "Anulado",
};

/** Mismo formato que el API: XXXX-XXXX, mayúsculas, sin ambigüedades. */
export function normalizeTeamCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export function isCompleteTeamCode(code: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
}

export function teamInviteLink(code: string): string {
  return `https://nodohub.app/register?equipo=${encodeURIComponent(code)}`;
}

// El código se recuerda entre el registro, la verificación del mail (o Google)
// y el alta, que pasan por pantallas distintas.
const PENDING_KEY = "nodo:pending-team-code";

export function rememberPendingTeamCode(code: string): void {
  try {
    if (isCompleteTeamCode(code)) localStorage.setItem(PENDING_KEY, code);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* sin storage: se pide de nuevo en el alta */
  }
}

export function getPendingTeamCode(): string | null {
  try {
    const code = localStorage.getItem(PENDING_KEY);
    return code && isCompleteTeamCode(code) ? code : null;
  } catch {
    return null;
  }
}

export function clearPendingTeamCode(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* nada */
  }
}

/** Mensaje claro para los errores del canje. */
export function teamJoinError(err: unknown): string {
  const res = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
  if (res?.status === 409) return "Ya pertenecés a un comercio: no podés sumarte a otro con esta invitación.";
  if (res?.status === 429) return "Demasiados intentos. Esperá un minuto y probá de nuevo.";
  return res?.data?.message || "No pudimos sumarte al equipo. Revisá el código.";
}
