import { TENANT_ROLE_LABELS, type TenantRole } from "@nodo/shared";

export type AssignedSellerView = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  role: TenantRole | null;
  roleLabel: string | null;
  orgEmail: string | null;
  orgPhone: string | null;
};

export function mapAssignedSeller(input: {
  user: { id: string; username: string; email: string } | null | undefined;
  membership?: { role: string; title: string | null } | null;
  org?: { contactEmail?: string | null; contactPhone?: string | null } | null;
}): AssignedSellerView | null {
  const user = input.user;
  if (!user) return null;
  const role = (input.membership?.role ?? null) as TenantRole | null;
  const roleLabel = role && TENANT_ROLE_LABELS[role] ? TENANT_ROLE_LABELS[role] : null;
  return {
    id: user.id,
    name: user.username,
    email: user.email,
    title: input.membership?.title?.trim() || null,
    role,
    roleLabel,
    orgEmail: input.org?.contactEmail?.trim() || null,
    orgPhone: input.org?.contactPhone?.trim() || null,
  };
}
