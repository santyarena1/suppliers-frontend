import { ForbiddenException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { InboxService } from "../inbox/inbox.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import type { CreateUpgradeRequestDto } from "./dto/storefront.dto";

type UpgradeKind = "DISTRIBUTOR" | "BRAND";
const ORIGIN = "Vender en NODO";
const KIND_LABEL: Record<UpgradeKind, string> = { DISTRIBUTOR: "Distribuidor", BRAND: "Marca" };

/**
 * Un comercio pide pasar a ser Distribuidor o Marca desde Vender en NODO. Entra a
 * la bandeja "Solicitudes" del superadmin (con aviso por mail) como cualquier
 * pedido de distribuidor o marca; NODO arma la organización a mano.
 */
@Injectable()
export class UpgradeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService
  ) {}

  /** Lo que ya pidió este comercio desde Vender en NODO. */
  async mine(tenant: TenantContext) {
    const rows = await this.prisma.inboxRequest.findMany({
      where: { tenantId: tenant.tenantId, type: "SUPPLIER_JOIN" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return rows.flatMap((r) => {
      const kind = kindOf(r.data);
      if (!kind) return [];
      return [
        {
          id: r.id,
          kind,
          // Atendida = ya la vio NODO y lo contactó; archivada = cerrada.
          status: r.status === "NEW" ? ("PENDING" as const) : r.status === "HANDLED" ? ("CONTACTED" as const) : ("DONE" as const),
          message: r.message,
          contact: r.contactPhone ?? r.contactEmail,
          createdAt: r.createdAt.toISOString(),
          updatedAt: (r.handledAt ?? r.createdAt).toISOString(),
        },
      ];
    });
  }

  async create(tenant: TenantContext, dto: CreateUpgradeRequestDto) {
    if (tenant.tenantType !== "RETAILER") throw new ForbiddenException("Las solicitudes son para comercios");
    if (tenant.tenantRole !== "OWNER" && tenant.tenantRole !== "ADMIN") {
      throw new ForbiddenException("Solo el dueño o un administrador del comercio puede pedirlo");
    }
    const message = dto.message?.trim().slice(0, 2000) || null;
    const contact = dto.contact?.trim().slice(0, 200) || null;
    // Una sola pendiente por tipo: si ya la pidió, se actualiza el mensaje en vez de duplicarla.
    const open = (await this.mine(tenant)).find((r) => r.kind === dto.kind && r.status === "PENDING");
    if (open) {
      await this.prisma.inboxRequest.update({
        where: { id: open.id },
        data: { ...(message ? { message } : {}), ...(contact ? contactFields(contact) : {}) },
      });
      return (await this.mine(tenant)).find((r) => r.id === open.id)!;
    }
    const [org, user] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenant.tenantId }, select: { name: true, contactPhone: true, contactEmail: true } }),
      this.prisma.user.findUnique({ where: { id: tenant.userId }, select: { username: true, email: true } }),
    ]);
    const label = KIND_LABEL[dto.kind];
    const fields = contact ? contactFields(contact) : {};
    await this.inbox.record({
      type: "SUPPLIER_JOIN",
      title: `${org?.name ?? tenant.tenantName} quiere ser ${dto.kind === "BRAND" ? "marca" : "distribuidor"}`,
      message,
      contactName: user?.username ?? null,
      contactEmail: fields.contactEmail ?? user?.email ?? org?.contactEmail ?? null,
      contactPhone: fields.contactPhone ?? org?.contactPhone ?? null,
      company: org?.name ?? tenant.tenantName,
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      data: { Origen: ORIGIN, Tipo: label },
    });
    const created = (await this.mine(tenant)).find((r) => r.kind === dto.kind && r.status === "PENDING");
    if (!created) throw new ServiceUnavailableException("No se pudo registrar la solicitud. Probá de nuevo.");
    return created;
  }
}

function kindOf(data: unknown): UpgradeKind | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (d.Origen !== ORIGIN) return null;
  if (d.Tipo === KIND_LABEL.DISTRIBUTOR) return "DISTRIBUTOR";
  if (d.Tipo === KIND_LABEL.BRAND) return "BRAND";
  return null;
}

function contactFields(contact: string): { contactEmail?: string; contactPhone?: string } {
  return contact.includes("@") ? { contactEmail: contact } : { contactPhone: contact };
}
