import api, { type OnboardingStatus, type TenantRole } from "@/lib/api";

/**
 * Pedidos para sumarse a un comercio sin código: quien no tiene organización
 * escribe el mail del dueño. Ver apps/api/src/tenants/join-requests.service.ts.
 */

export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

/** El pedido propio. No dice a qué comercio fue: solo el mail que se escribió. */
export interface MyJoinRequest {
  id: string;
  ownerEmail: string;
  status: JoinRequestStatus;
  createdAt: string;
  decidedAt: string | null;
}

/** Lo que ve el equipo del comercio. */
export interface TeamJoinRequest {
  id: string;
  user: { id: string; username: string; email: string };
  createdAt: string;
}

export const joinRequestsApi = {
  send: (ownerEmail: string) =>
    api.post<{ message: string; request: MyJoinRequest }>("/onboarding/join-request", { ownerEmail }),
  /** Si ya lo aprobaron, trae la sesión nueva para entrar al comercio. */
  mine: () =>
    api.get<{ request: MyJoinRequest | null; joined: { token: string; onboarding: OnboardingStatus } | null }>(
      "/onboarding/join-request"
    ),
  cancel: () => api.delete<{ cancelled: number }>("/onboarding/join-request"),
  list: () => api.get<TeamJoinRequest[]>("/my/team/join-requests"),
  approve: (id: string, role: TenantRole) =>
    api.post<{ id: string; status: "APPROVED"; role: TenantRole; roleLabel: string; username: string }>(
      `/my/team/join-requests/${id}/approve`,
      { role }
    ),
  reject: (id: string) => api.post<{ id: string; status: "REJECTED" }>(`/my/team/join-requests/${id}/reject`),
};

/** Mensaje claro para los errores del pedido. */
export function joinRequestError(err: unknown, fallback: string): string {
  const res = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
  if (res?.status === 429 && !res.data?.message) return "Demasiados intentos. Probá más tarde.";
  return res?.data?.message || fallback;
}
