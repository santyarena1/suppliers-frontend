import { TENANT_ROLES_CAN_WRITE_CHAT, type TenantRole, type TenantType } from "@nodo/shared";
import { clientLinkVisibleTo } from "../tenants/portfolio";

export type ChatActor = {
  tenantId: string;
  tenantType: TenantType;
  tenantRole: TenantRole;
  userId: string;
};

/**
 * El chat vive en el vínculo, no en la persona. Un comercio ve el hilo con su
 * distribuidor; un vendedor del distribuidor solo los de sus cuentas.
 * REVOKED no se habla. SUSPENDED sí: a veces hay que explicar por qué.
 */
export function chatLinkVisibleTo(
  link: { clientTenantId: string; supplierTenantId: string; accountManagerId: string | null; status: string },
  actor: ChatActor
): boolean {
  if (link.status === "REVOKED") return false;
  if (actor.tenantType === "RETAILER") return link.clientTenantId === actor.tenantId;
  if (actor.tenantType === "DISTRIBUTOR") {
    if (link.supplierTenantId !== actor.tenantId) return false;
    return clientLinkVisibleTo(link, actor);
  }
  return false;
}

export function canWriteChat(role: TenantRole): boolean {
  return TENANT_ROLES_CAN_WRITE_CHAT.includes(role);
}

export function chatPeerName(
  link: { clientTenant: { name: string }; supplierTenant: { name: string } },
  actorType: TenantType
): string {
  return actorType === "RETAILER" ? link.supplierTenant.name : link.clientTenant.name;
}
