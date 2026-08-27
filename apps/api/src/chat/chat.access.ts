import { tenantCanWriteChat, TENANT_ROLE_LABELS, type TenantRole, type TenantType } from "@nodo/shared";
import { clientLinkVisibleTo } from "../tenants/portfolio";

export type ChatActor = {
  tenantId: string;
  tenantType: TenantType;
  tenantRole: TenantRole;
  userId: string;
};

/** Distro o marca: el lado proveedor del TenantLink. El hilo sigue siendo dos personas. */
export function isChatSupplierSide(type: TenantType): boolean {
  return type === "DISTRIBUTOR" || type === "BRAND";
}

/**
 * Puede esta persona ver el vínculo (y por lo tanto empezar un chat ahí).
 * REVOKED no se habla. SUSPENDED sí: a veces hay que explicar por qué.
 */
export function chatLinkVisibleTo(
  link: { clientTenantId: string; supplierTenantId: string; accountManagerId: string | null; status: string },
  actor: ChatActor
): boolean {
  if (link.status === "REVOKED") return false;
  if (actor.tenantType === "RETAILER") return link.clientTenantId === actor.tenantId;
  if (isChatSupplierSide(actor.tenantType)) {
    if (link.supplierTenantId !== actor.tenantId) return false;
    if (actor.tenantType === "BRAND" && actor.tenantRole === "COMMERCIAL") {
      return link.accountManagerId === actor.userId;
    }
    return clientLinkVisibleTo(link, actor);
  }
  return false;
}

/**
 * El hilo es de dos personas. El dueño del distro no entra al chat del vendedor;
 * el dueño del local no entra al del comprador.
 */
export function chatThreadVisibleTo(
  thread: { distroUserId: string; storeUserId: string; link: Parameters<typeof chatLinkVisibleTo>[0] },
  actor: ChatActor
): boolean {
  if (!chatLinkVisibleTo(thread.link, actor)) return false;
  if (isChatSupplierSide(actor.tenantType)) return thread.distroUserId === actor.userId;
  if (actor.tenantType === "RETAILER") return thread.storeUserId === actor.userId;
  return false;
}

export function canWriteChat(role: TenantRole, tenantType: TenantType = "DISTRIBUTOR"): boolean {
  return tenantCanWriteChat(tenantType, role);
}

export function chatRoleLabel(role: TenantRole | null | undefined): string {
  if (!role) return "";
  return TENANT_ROLE_LABELS[role] ?? role;
}

export function chatPeerOrgName(
  link: { clientTenant: { name: string }; supplierTenant: { name: string } },
  actorType: TenantType
): string {
  return actorType === "RETAILER" ? link.supplierTenant.name : link.clientTenant.name;
}

/** @deprecated Usar chatPeerOrgName. */
export function chatPeerName(
  link: { clientTenant: { name: string }; supplierTenant: { name: string } },
  actorType: TenantType
): string {
  return chatPeerOrgName(link, actorType);
}

/** Una línea para búsqueda y avisos: usuario · rol · organización. */
export function formatChatPeerLine(peer: { username?: string; name?: string; roleLabel: string; orgName: string }) {
  const who = (peer.name ?? peer.username ?? "").trim();
  return [who, peer.roleLabel, peer.orgName].filter(Boolean).join(" · ");
}
