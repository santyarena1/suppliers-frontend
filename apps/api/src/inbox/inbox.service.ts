import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { inboxMail } from "./inbox-mail";
import { INBOX_TYPES, type InboxInput, type InboxStatus, type InboxType } from "./inbox-types";
import type { ContactKind, ContactRequestDto, SupplierJoinDto, UpdateInboxDto } from "./dto/inbox.dto";

const PAGE_SIZE = 50;

const KIND_LABELS: Record<ContactKind, string> = {
  CONTACT: "Consulta",
  CUSTOM: "NODO Custom",
  SUPPLIER: "Distribuidor",
  BRAND: "Marca",
  PAYMENT: "Coordinar pago",
};

const KIND_TYPE: Record<ContactKind, InboxType> = {
  CONTACT: "CONTACT",
  CUSTOM: "PLAN_REQUEST",
  SUPPLIER: "SUPPLIER_JOIN",
  BRAND: "SUPPLIER_JOIN",
  PAYMENT: "PAYMENT_NOTICE",
};

function contactTitle(kind: ContactKind, who: string): string {
  if (kind === "SUPPLIER") return `${who} quiere sumarse como distribuidor`;
  if (kind === "BRAND") return `${who} quiere sumarse como marca`;
  if (kind === "CUSTOM") return `${who} pide NODO Custom`;
  if (kind === "PAYMENT") return `${who} quiere coordinar el pago`;
  return `Consulta de ${who}`;
}

/**
 * Bandeja de solicitudes del superadmin. `record` nunca hace fallar al que lo
 * llama: si la base o el mail fallan, queda en el log y el usuario sigue.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService
  ) {}

  async record(input: InboxInput): Promise<void> {
    let id: string;
    try {
      const row = await this.prisma.inboxRequest.create({
        data: {
          type: input.type,
          title: input.title.slice(0, 200),
          message: input.message?.trim() || null,
          contactName: input.contactName?.trim() || null,
          contactEmail: input.contactEmail?.trim() || null,
          contactPhone: input.contactPhone?.trim() || null,
          company: input.company?.trim() || null,
          tenantId: input.tenantId ?? null,
          userId: input.userId ?? null,
          data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        select: { id: true },
      });
      id = row.id;
    } catch (err) {
      this.logger.error(`No se pudo guardar la solicitud ${input.type}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (input.notify === false) return;
    await this.notify(id, input);
  }

  private async notify(id: string, input: InboxInput) {
    const to = (this.config.get<string>("ADMIN_NOTIFY_EMAIL") || "").trim();
    if (!to) {
      this.logger.warn(`ADMIN_NOTIFY_EMAIL no configurado: la solicitud ${id} queda solo en la bandeja`);
      return;
    }
    try {
      await this.mail.send({ to, ...inboxMail(input) });
      await this.prisma.inboxRequest.update({ where: { id }, data: { emailedAt: new Date() } });
    } catch (err) {
      this.logger.warn(`No se pudo avisar por mail la solicitud ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---------- Entradas ----------

  /** Formulario de la landing o de la app (con sesión se adjunta quién es). */
  async contact(dto: ContactRequestDto, from?: { userId: string; tenantId?: string | null }) {
    const kind = dto.kind ?? "CONTACT";
    const who = dto.company?.trim() || dto.name.trim();
    await this.record({
      type: KIND_TYPE[kind],
      title: contactTitle(kind, who),
      message: dto.message,
      contactName: dto.name,
      contactEmail: dto.email,
      contactPhone: dto.phone,
      company: dto.company,
      userId: from?.userId ?? null,
      tenantId: from?.tenantId ?? null,
      data: { Origen: from ? "Desde la app" : "Landing", Tipo: KIND_LABELS[kind] },
    });
    return { received: true };
  }

  async supplierJoin(userId: string, dto: SupplierJoinDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true, email: true } });
    await this.record({
      type: "SUPPLIER_JOIN",
      title: contactTitle(dto.kind, dto.company.trim()),
      message: dto.message,
      contactName: user.username,
      contactEmail: user.email,
      contactPhone: dto.phone,
      company: dto.company,
      userId,
      data: { Origen: "Alta en la app", Tipo: KIND_LABELS[dto.kind], Web: dto.website ?? null },
    });
    return { received: true };
  }

  // ---------- Administración ----------

  async list(filter: { status?: InboxStatus; type?: InboxType; page?: number }) {
    const where: Prisma.InboxRequestWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.type ? { type: filter.type } : {}),
    };
    const page = Math.max(1, filter.page ?? 1);
    const [items, total, pending] = await Promise.all([
      this.prisma.inboxRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.inboxRequest.count({ where }),
      this.prisma.inboxRequest.groupBy({ by: ["type"], where: { status: "NEW" }, _count: { _all: true } }),
    ]);
    const tenantIds = [...new Set(items.map((i) => i.tenantId).filter((v): v is string => Boolean(v)))];
    const tenants = tenantIds.length
      ? await this.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
      : [];
    const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
    const pendingByType = Object.fromEntries(INBOX_TYPES.map((t) => [t, 0])) as Record<InboxType, number>;
    for (const row of pending) pendingByType[row.type as InboxType] = row._count._all;
    return {
      items: items.map((i) => ({ ...i, tenantName: i.tenantId ? tenantName.get(i.tenantId) ?? null : null })),
      total,
      page,
      pageSize: PAGE_SIZE,
      pending: Object.values(pendingByType).reduce((a, b) => a + b, 0),
      pendingByType,
    };
  }

  async pendingCount() {
    return { pending: await this.prisma.inboxRequest.count({ where: { status: "NEW" } }) };
  }

  async update(id: string, actorUserId: string, dto: UpdateInboxDto) {
    const existing = await this.prisma.inboxRequest.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException("Solicitud inexistente");
    const handled = dto.status !== undefined && dto.status !== "NEW";
    return this.prisma.inboxRequest.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status, handledAt: handled ? new Date() : null, handledById: handled ? actorUserId : null } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
      },
    });
  }
}
