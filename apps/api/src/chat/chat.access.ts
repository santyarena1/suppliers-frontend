import { tenantCanWriteChat, TENANT_ROLE_LABELS, type TenantRole, type TenantType } from "@nodo/shared";
import { clientLinkVisibleTo } from "../tenants/portfolio";

export type ChatActor = {
  tenantId: string;
  tenantType: TenantType;
  tenantRole: TenantRole;
  userId: string;
};

/** Distro o marca: tipos que pueden ser el lado proveedor del TenantLink. */
export function isChatSupplierSide(type: TenantType): boolean {
  return type === "DISTRIBUTOR" || type === "BRAND";
}

/**
 * El hilo es dos personas. `distroUserId` es la persona del **proveedor**
 * (distro o marca); `storeUserId` es la del **cliente** (comercio o distro
 * vinculado a una marca). Un distro puede estar de los dos lados, según el vínculo.
 */
export function isChatSupplierOfLink(
  link: { supplierTenantId: string },
  actor: { tenantId: string }
): boolean {
  return link.supplierTenantId === actor.tenantId;
}

export function isChatClientOfLink(
  link: { clientTenantId: string },
  actor: { tenantId: string }
): boolean {
  return link.clientTenantId === actor.tenantId;
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
  if (isChatClientOfLink(link, actor)) {
    return actor.tenantType === "RETAILER" || actor.tenantType === "DISTRIBUTOR";
  }
  if (isChatSupplierOfLink(link, actor) && isChatSupplierSide(actor.tenantType)) {
    if (actor.tenantType === "BRAND" && actor.tenantRole === "COMMERCIAL") {
      return link.accountManagerId === actor.userId;
    }
    return clientLinkVisibleTo(link, actor);
  }
  return false;
}

/**
 * El hilo es de dos personas. El dueño del distro no entra al chat del vendedor;
 * el dueño del local no entra al del comprador. Si el distro es cliente de una
 * marca, mira `storeUserId` (lado cliente), no `distroUserId`.
 */
export function chatThreadVisibleTo(
  thread: { distroUserId: string; storeUserId: string; link: Parameters<typeof chatLinkVisibleTo>[0] },
  actor: ChatActor
): boolean {
  if (!chatLinkVisibleTo(thread.link, actor)) return false;
  if (isChatSupplierOfLink(thread.link, actor)) return thread.distroUserId === actor.userId;
  if (isChatClientOfLink(thread.link, actor)) return thread.storeUserId === actor.userId;
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
  link: {
    clientTenant: { name: string };
    supplierTenant: { name: string };
    clientTenantId?: string;
    supplierTenantId?: string;
  },
  actorType: TenantType,
  actorTenantId?: string
): string {
  if (actorTenantId && link.clientTenantId && actorTenantId === link.clientTenantId) {
    return link.supplierTenant.name;
  }
  if (actorTenantId && link.supplierTenantId && actorTenantId === link.supplierTenantId) {
    return link.clientTenant.name;
  }
  return actorType === "RETAILER" ? link.supplierTenant.name : link.clientTenant.name;
}

/** @deprecated Usar chatPeerOrgName. */
export function chatPeerName(
  link: {
    clientTenant: { name: string };
    supplierTenant: { name: string };
    clientTenantId?: string;
    supplierTenantId?: string;
  },
  actorType: TenantType,
  actorTenantId?: string
): string {
  return chatPeerOrgName(link, actorType, actorTenantId);
}

/** Una línea para búsqueda y avisos: usuario · rol · organización. */
export function formatChatPeerLine(peer: { username?: string; name?: string; roleLabel: string; orgName: string }) {
  const who = (peer.name ?? peer.username ?? "").trim();
  return [who, peer.roleLabel, peer.orgName].filter(Boolean).join(" · ");
}
