import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { isChatReactionEmoji, PROVIDER_LABELS, type Provider } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { canWriteChat, chatLinkVisibleTo, chatPeerName, type ChatActor } from "./chat.access";
import { ChatHub } from "./chat.hub";
import type { SendChatMessageDto } from "./dto/chat.dto";

const LINK_SELECT = {
  id: true,
  status: true,
  accountManagerId: true,
  clientTenantId: true,
  supplierTenantId: true,
  discountPercent: true,
  clientTenant: { select: { id: true, name: true, type: true, contactEmail: true, contactPhone: true } },
  supplierTenant: { select: { id: true, name: true, type: true, contactEmail: true, contactPhone: true, providerKey: true } },
  accountManager: { select: { id: true, username: true, email: true } },
} satisfies Prisma.TenantLinkSelect;

const MESSAGE_INCLUDE = {
  author: { select: { id: true, username: true } },
  replyTo: {
    select: {
      id: true,
      body: true,
      kind: true,
      author: { select: { username: true } },
      deletedAt: true,
    },
  },
  reactions: {
    include: { user: { select: { id: true, username: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.ChatMessageInclude;

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_PINS = 5;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: ChatHub
  ) {}

  async listThreads(tenant: TenantContext) {
    const links = await this.visibleLinks(tenant);
    const linkIds = links.map((link) => link.id);
    const threads = await this.prisma.chatThread.findMany({
      where: { linkId: { in: linkIds } },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { author: { select: { username: true } } },
        },
      },
    });
    const threadByLink = new Map(threads.map((row) => [row.linkId, row]));
    const threadIds = threads.map((row) => row.id);
    const unreadByThread = await this.countUnreads(tenant.userId, threadIds);
    const peerOnlineByLink = await this.peerOnlineByLink(tenant, links);

    const items = links.map((link) => {
      const thread = threadByLink.get(link.id);
      const last = thread?.messages[0];
      return {
        threadId: thread?.id ?? null,
        linkId: link.id,
        status: link.status,
        peer: this.peerOf(link, tenant),
        accountManager: link.accountManager,
        lastMessage: last ? this.preview(last) : null,
        lastMessageAt: thread?.lastMessageAt?.toISOString() ?? null,
        unreadCount: thread ? unreadByThread.get(thread.id) ?? 0 : 0,
        peerOnline: peerOnlineByLink.get(link.id) ?? false,
        peerHref: this.peerHref(link, tenant),
      };
    });
    items.sort((a, b) => {
      const ta = a.lastMessageAt ?? "";
      const tb = b.lastMessageAt ?? "";
      if (ta === tb) return a.peer.name.localeCompare(b.peer.name, "es");
      return tb.localeCompare(ta);
    });
    const unreadTotal = items.reduce((sum, item) => sum + item.unreadCount, 0);
    return { canWrite: canWriteChat(tenant.tenantRole, tenant.tenantType), unreadTotal, threads: items };
  }

  async open(tenant: TenantContext, linkId: string) {
    const link = await this.requireLink(tenant, linkId);
    const thread = await this.prisma.chatThread.upsert({
      where: { linkId: link.id },
      create: { linkId: link.id },
      update: {},
    });
    return this.serializeThread(tenant, thread.id);
  }

  async getThread(tenant: TenantContext, threadId: string) {
    return this.serializeThread(tenant, threadId);
  }

  async listMessages(tenant: TenantContext, threadId: string, opts: { before?: string; take?: number }) {
    await this.requireThread(tenant, threadId);
    const take = opts.take ?? 50;
    const before = opts.before
      ? await this.prisma.chatMessage.findUnique({ where: { id: opts.before }, select: { createdAt: true } })
      : null;
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        threadId,
        ...(before ? { createdAt: { lt: before.createdAt } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      include: MESSAGE_INCLUDE,
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      hasMore,
      messages: page.reverse().map((row) => this.serializeMessage(row)),
    };
  }

  async send(tenant: TenantContext, threadId: string, dto: SendChatMessageDto) {
    this.assertWrite(tenant);
    const kind = dto.kind ?? "TEXT";
    if (kind === "ORDER" || kind === "PRODUCT") {
      throw new BadRequestException("Ese tipo de mensaje lo arma NODO, no se manda a mano");
    }
    if (kind === "TEXT" && !dto.body?.trim()) {
      throw new BadRequestException("El mensaje está vacío");
    }
    if (kind === "IMAGE" || kind === "FILE") {
      const url = dto.payload && typeof dto.payload.url === "string" ? dto.payload.url : "";
      if (!/^\/assets\/[0-9a-f-]{36}$/i.test(url)) {
        throw new BadRequestException("El archivo tiene que ser uno que subiste en este chat");
      }
    }
    return this.persistMessage(tenant, threadId, dto);
  }

  private async persistMessage(tenant: TenantContext, threadId: string, dto: SendChatMessageDto) {
    const thread = await this.requireThread(tenant, threadId);
    if (dto.replyToId) {
      const reply = await this.prisma.chatMessage.findUnique({ where: { id: dto.replyToId } });
      if (!reply || reply.threadId !== threadId) throw new BadRequestException("Ese mensaje no está en este hilo");
    }
    const kind = dto.kind ?? "TEXT";
    const row = await this.prisma.chatMessage.create({
      data: {
        threadId,
        authorUserId: tenant.userId,
        kind,
        body: (dto.body ?? "").trim(),
        payload: (dto.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        replyToId: dto.replyToId,
      },
      include: MESSAGE_INCLUDE,
    });
    await this.prisma.chatThread.update({
      where: { id: threadId },
      data: { lastMessageAt: row.createdAt },
    });
    await this.touchRead(threadId, tenant.userId, row.createdAt);
    const message = this.serializeMessage(row);
    const userIds = await this.participantUserIds(thread.link);
    this.hub.emitToUsers(userIds, { type: "message", threadId, data: message });
    return message;
  }

  async edit(tenant: TenantContext, messageId: string, body: string) {
    this.assertWrite(tenant);
    const row = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!row || row.deletedAt) throw new NotFoundException("Mensaje no encontrado");
    await this.requireThread(tenant, row.threadId);
    if (row.authorUserId !== tenant.userId) throw new ForbiddenException("Solo podés editar lo que escribiste");
    if (row.kind !== "TEXT") throw new BadRequestException("Ese mensaje no se edita");
    if (Date.now() - row.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new BadRequestException("Pasaron más de 15 minutos");
    }
    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { body: body.trim(), editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    });
    const message = this.serializeMessage(updated);
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: row.threadId },
      include: { link: { select: LINK_SELECT } },
    });
    if (thread) this.hub.emitToUsers(await this.participantUserIds(thread.link), { type: "message_edited", threadId: row.threadId, data: message });
    return message;
  }

  async remove(tenant: TenantContext, messageId: string) {
    this.assertWrite(tenant);
    const row = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!row || row.deletedAt) throw new NotFoundException("Mensaje no encontrado");
    await this.requireThread(tenant, row.threadId);
    const ownOrg = row.authorUserId === tenant.userId;
    const admin = tenant.tenantRole === "OWNER" || tenant.tenantRole === "ADMIN";
    if (!ownOrg && !admin) throw new ForbiddenException("No podés borrar ese mensaje");
    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: "", payload: Prisma.JsonNull },
      include: MESSAGE_INCLUDE,
    });
    const message = this.serializeMessage(updated);
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: row.threadId },
      include: { link: { select: LINK_SELECT } },
    });
    if (thread) this.hub.emitToUsers(await this.participantUserIds(thread.link), { type: "message_deleted", threadId: row.threadId, data: message });
    return message;
  }

  async markRead(tenant: TenantContext, threadId: string) {
    await this.requireThread(tenant, threadId);
    await this.touchRead(threadId, tenant.userId, new Date());
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      include: { link: { select: LINK_SELECT } },
    });
    if (thread) {
      this.hub.emitToUsers(await this.participantUserIds(thread.link), {
        type: "read",
        threadId,
        data: { userId: tenant.userId, lastReadAt: new Date().toISOString() },
      });
    }
    return { threadId, lastReadAt: new Date().toISOString() };
  }

  async typing(tenant: TenantContext, threadId: string) {
    this.assertWrite(tenant);
    const thread = await this.requireThread(tenant, threadId);
    const username = await this.usernameOf(tenant.userId);
    const typing = this.hub.setTyping(threadId, tenant.userId, username);
    this.hub.emitToUsers(await this.participantUserIds(thread.link), { type: "typing", threadId, data: typing });
    return { typing };
  }

  async react(tenant: TenantContext, messageId: string, emoji: string) {
    this.assertWrite(tenant);
    if (!isChatReactionEmoji(emoji)) throw new BadRequestException("Esa reacción no está permitida");
    const row = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!row || row.deletedAt) throw new NotFoundException("Mensaje no encontrado");
    const thread = await this.requireThread(tenant, row.threadId);
    const existing = await this.prisma.chatReaction.findUnique({
      where: { messageId_userId: { messageId, userId: tenant.userId } },
    });
    if (existing?.emoji === emoji) {
      await this.prisma.chatReaction.delete({
        where: { messageId_userId: { messageId, userId: tenant.userId } },
      });
    } else {
      await this.prisma.chatReaction.upsert({
        where: { messageId_userId: { messageId, userId: tenant.userId } },
        create: { messageId, userId: tenant.userId, emoji },
        update: { emoji },
      });
    }
    const updated = await this.prisma.chatMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: MESSAGE_INCLUDE,
    });
    const message = this.serializeMessage(updated);
    this.hub.emitToUsers(await this.participantUserIds(thread.link), {
      type: "message_reacted",
      threadId: row.threadId,
      data: message,
    });
    return message;
  }

  async usernameOf(userId: string) {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    return row?.username ?? "Alguien";
  }

  async pin(tenant: TenantContext, threadId: string, messageId: string) {
    this.assertWrite(tenant);
    await this.requireThread(tenant, threadId);
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message || message.threadId !== threadId || message.deletedAt) {
      throw new NotFoundException("Mensaje no encontrado");
    }
    const count = await this.prisma.chatPin.count({ where: { threadId } });
    if (count >= MAX_PINS) throw new BadRequestException(`Hasta ${MAX_PINS} mensajes fijados`);
    await this.prisma.chatPin.upsert({
      where: { threadId_messageId: { threadId, messageId } },
      create: { threadId, messageId, pinnedById: tenant.userId },
      update: {},
    });
    return this.serializeThread(tenant, threadId);
  }

  async unpin(tenant: TenantContext, threadId: string, messageId: string) {
    this.assertWrite(tenant);
    await this.requireThread(tenant, threadId);
    await this.prisma.chatPin.deleteMany({ where: { threadId, messageId } });
    return this.serializeThread(tenant, threadId);
  }

  async search(tenant: TenantContext, q: string, take = 30) {
    const needle = q.trim();
    if (needle.length < 2) return { messages: [] as ReturnType<ChatService["serializeMessage"]>[] };
    const links = await this.visibleLinks(tenant);
    const threads = await this.prisma.chatThread.findMany({
      where: { linkId: { in: links.map((link) => link.id) } },
      select: { id: true, linkId: true },
    });
    const byThread = new Map(threads.map((row) => [row.id, row.linkId]));
    if (threads.length === 0) return { messages: [] };
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        threadId: { in: threads.map((row) => row.id) },
        deletedAt: null,
        body: { contains: needle, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      take,
      include: MESSAGE_INCLUDE,
    });
    const linkById = new Map(links.map((link) => [link.id, link]));
    return {
      messages: rows.map((row) => {
        const link = linkById.get(byThread.get(row.threadId) ?? "");
        return {
          ...this.serializeMessage(row),
          threadId: row.threadId,
          peerName: link ? chatPeerName(link, tenant.tenantType) : "",
        };
      }),
    };
  }

  async shareOrder(tenant: TenantContext, orderId: string, threadId?: string) {
    this.assertWrite(tenant);
    const order = await this.prisma.providerOrder.findUnique({ where: { id: orderId } });
    if (!order || order.tenantId !== tenant.tenantId) throw new NotFoundException("Pedido no encontrado");
    const target = threadId
      ? await this.requireThread(tenant, threadId)
      : await this.threadForProvider(tenant, order.provider);
    if (!target) throw new BadRequestException("No hay un vínculo con ese distribuidor para avisar");
    return this.persistMessage(tenant, target.id, {
      kind: "ORDER",
      body: `Pedido a ${PROVIDER_LABELS[order.provider as Provider] ?? order.provider}`,
      payload: {
        orderId: order.id,
        provider: order.provider,
        providerName: PROVIDER_LABELS[order.provider as Provider] ?? order.provider,
        total: order.total == null ? null : Number(order.total),
        status: order.status,
        approvalStatus: order.approvalStatus,
      },
    });
  }

  async notifyOrderCreated(order: {
    tenantId: string;
    provider: string;
    id: string;
    total: Prisma.Decimal | number | null;
    status: string;
    approvalStatus: string;
    createdByUserId: string | null;
  }) {
    try {
      const link = await this.prisma.tenantLink.findFirst({
        where: {
          clientTenantId: order.tenantId,
          status: { in: ["ACTIVE", "SUSPENDED"] },
          supplierTenant: { providerKey: order.provider },
        },
      });
      if (!link) return;
      const thread = await this.prisma.chatThread.upsert({
        where: { linkId: link.id },
        create: { linkId: link.id },
        update: {},
      });
      const author = order.createdByUserId
        ? await this.prisma.user.findUnique({ where: { id: order.createdByUserId }, select: { username: true } })
        : null;
      const row = await this.prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          authorUserId: null,
          kind: "ORDER",
          body: `${author?.username ?? "El comercio"} cargó un pedido`,
          payload: {
            orderId: order.id,
            provider: order.provider,
            providerName: PROVIDER_LABELS[order.provider as Provider] ?? order.provider,
            total: order.total == null ? null : Number(order.total),
            status: order.status,
            approvalStatus: order.approvalStatus,
          },
        },
        include: MESSAGE_INCLUDE,
      });
      await this.prisma.chatThread.update({ where: { id: thread.id }, data: { lastMessageAt: row.createdAt } });
      const full = await this.prisma.tenantLink.findUnique({ where: { id: link.id }, select: LINK_SELECT });
      if (full) this.hub.emitToUsers(await this.participantUserIds(full), { type: "message", threadId: thread.id, data: this.serializeMessage(row) });
    } catch {
      // El pedido no puede fallar porque el chat no escribió.
    }
  }

  async notifyLinkChange(
    linkId: string,
    event: "seller_changed" | "discount_changed" | "status_changed",
    text: string
  ) {
    try {
      const link = await this.prisma.tenantLink.findUnique({ where: { id: linkId }, select: LINK_SELECT });
      if (!link || link.status === "REVOKED") return;
      const thread = await this.prisma.chatThread.upsert({
        where: { linkId },
        create: { linkId },
        update: {},
      });
      const row = await this.prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          authorUserId: null,
          kind: "SYSTEM",
          body: text,
          payload: { event },
        },
        include: MESSAGE_INCLUDE,
      });
      await this.prisma.chatThread.update({ where: { id: thread.id }, data: { lastMessageAt: row.createdAt } });
      this.hub.emitToUsers(await this.participantUserIds(link), { type: "message", threadId: thread.id, data: this.serializeMessage(row) });
    } catch {
      // Igual que el pedido: el vínculo se guarda aunque el aviso no salga.
    }
  }

  async unreadTotal(tenant: TenantContext) {
    const listed = await this.listThreads(tenant);
    return { unreadTotal: listed.unreadTotal };
  }

  private actor(tenant: TenantContext): ChatActor {
    return {
      tenantId: tenant.tenantId,
      tenantType: tenant.tenantType,
      tenantRole: tenant.tenantRole,
      userId: tenant.userId,
    };
  }

  private assertWrite(tenant: TenantContext) {
    if (!canWriteChat(tenant.tenantRole, tenant.tenantType)) {
      throw new ForbiddenException("Tu rol es de solo lectura");
    }
  }

  private async visibleLinks(tenant: TenantContext) {
    const open: Array<"ACTIVE" | "SUSPENDED" | "PENDING"> = ["ACTIVE", "SUSPENDED", "PENDING"];
    const where =
      tenant.tenantType === "RETAILER"
        ? { clientTenantId: tenant.tenantId, status: { in: open } }
        : tenant.tenantType === "DISTRIBUTOR"
          ? { supplierTenantId: tenant.tenantId, status: { in: open } }
          : { id: "__none__" };
    const links = await this.prisma.tenantLink.findMany({
      where,
      select: LINK_SELECT,
      orderBy: { updatedAt: "desc" },
    });
    return links.filter((link) => chatLinkVisibleTo(link, this.actor(tenant)));
  }

  private async requireLink(tenant: TenantContext, linkId: string) {
    const link = await this.prisma.tenantLink.findUnique({ where: { id: linkId }, select: LINK_SELECT });
    if (!link || !chatLinkVisibleTo(link, this.actor(tenant))) {
      throw new NotFoundException("Conversación no encontrada");
    }
    return link;
  }

  private async requireThread(tenant: TenantContext, threadId: string) {
    const thread = await this.prisma.chatThread.findUnique({
      where: { id: threadId },
      include: { link: { select: LINK_SELECT } },
    });
    if (!thread || !chatLinkVisibleTo(thread.link, this.actor(tenant))) {
      throw new NotFoundException("Conversación no encontrada");
    }
    return thread;
  }

  private async threadForProvider(tenant: TenantContext, provider: string) {
    const link = await this.prisma.tenantLink.findFirst({
      where: {
        clientTenantId: tenant.tenantId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
        supplierTenant: { providerKey: provider },
      },
    });
    if (!link || !chatLinkVisibleTo({ ...link, clientTenantId: link.clientTenantId, supplierTenantId: link.supplierTenantId, accountManagerId: link.accountManagerId, status: link.status }, this.actor(tenant))) {
      return null;
    }
    return this.prisma.chatThread.upsert({
      where: { linkId: link.id },
      create: { linkId: link.id },
      update: {},
    });
  }

  private async participantUserIds(link: {
    clientTenantId: string;
    supplierTenantId: string;
    accountManagerId: string | null;
  }) {
    const members = await this.prisma.tenantMembership.findMany({
      where: {
        active: true,
        user: { active: true },
        OR: [{ tenantId: link.clientTenantId }, { tenantId: link.supplierTenantId }],
      },
      select: { userId: true, tenantId: true, role: true },
    });
    return members
      .filter((membership) => {
        if (membership.tenantId === link.clientTenantId) return true;
        return chatLinkVisibleTo(
          { ...link, status: "ACTIVE" },
          {
            tenantId: link.supplierTenantId,
            tenantType: "DISTRIBUTOR",
            tenantRole: membership.role as ChatActor["tenantRole"],
            userId: membership.userId,
          }
        );
      })
      .map((membership) => membership.userId);
  }

  private async touchRead(threadId: string, userId: string, at: Date) {
    await this.prisma.chatRead.upsert({
      where: { threadId_userId: { threadId, userId } },
      create: { threadId, userId, lastReadAt: at },
      update: { lastReadAt: at },
    });
  }

  private async serializeThread(tenant: TenantContext, threadId: string) {
    const thread = await this.requireThread(tenant, threadId);
    const [pins, read] = await Promise.all([
      this.prisma.chatPin.findMany({
        where: { threadId },
        include: { message: { include: MESSAGE_INCLUDE } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.chatRead.findUnique({
        where: { threadId_userId: { threadId, userId: tenant.userId } },
      }),
    ]);
    const peerTenantId =
      tenant.tenantType === "RETAILER" ? thread.link.supplierTenantId : thread.link.clientTenantId;
    const peerMembers = await this.prisma.tenantMembership.findMany({
      where: { tenantId: peerTenantId, active: true, user: { active: true } },
      select: { userId: true, user: { select: { username: true } } },
    });
    const peerIds = peerMembers.map((row) => row.userId);
    const peerReads =
      peerIds.length === 0
        ? []
        : await this.prisma.chatRead.findMany({
            where: { threadId, userId: { in: peerIds } },
          });
    const readByUser = new Map(peerReads.map((row) => [row.userId, row.lastReadAt]));
    const online = new Set(this.hub.onlineUserIds());
    return {
      threadId: thread.id,
      linkId: thread.linkId,
      status: thread.link.status,
      canWrite: canWriteChat(tenant.tenantRole),
      peer: this.peerOf(thread.link, tenant),
      accountManager: thread.link.accountManager,
      lastReadAt: read?.lastReadAt.toISOString() ?? null,
      peerLastReadAt: peerReads.reduce<Date | null>(
        (max, row) => (!max || row.lastReadAt > max ? row.lastReadAt : max),
        null
      )?.toISOString() ?? null,
      peerReads: peerMembers
        .filter((row) => readByUser.has(row.userId))
        .map((row) => ({
          userId: row.userId,
          username: row.user.username,
          lastReadAt: readByUser.get(row.userId)!.toISOString(),
        })),
      peerOnline: peerIds.some((id) => online.has(id)),
      peerHref: this.peerHref(thread.link, tenant),
      pins: pins.map((pin) => this.serializeMessage(pin.message)),
    };
  }

  private async countUnreads(userId: string, threadIds: string[]) {
    const unreadByThread = new Map<string, number>();
    if (threadIds.length === 0) return unreadByThread;
    const rows = await this.prisma.$queryRaw<Array<{ threadId: string; cnt: number }>>`
      SELECT m."threadId", COUNT(*)::int AS cnt
      FROM "ChatMessage" m
      LEFT JOIN "ChatRead" r
        ON r."threadId" = m."threadId" AND r."userId" = ${userId}
      WHERE m."threadId" IN (${Prisma.join(threadIds)})
        AND m."deletedAt" IS NULL
        AND (m."authorUserId" IS NULL OR m."authorUserId" <> ${userId})
        AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
      GROUP BY m."threadId"
    `;
    for (const row of rows) unreadByThread.set(row.threadId, row.cnt);
    return unreadByThread;
  }

  private async peerOnlineByLink(
    tenant: TenantContext,
    links: Array<{ id: string; clientTenantId: string; supplierTenantId: string }>
  ) {
    const result = new Map<string, boolean>();
    if (links.length === 0) return result;
    const peerTenantIds = [
      ...new Set(
        links.map((link) => (tenant.tenantType === "RETAILER" ? link.supplierTenantId : link.clientTenantId))
      ),
    ];
    const members = await this.prisma.tenantMembership.findMany({
      where: { tenantId: { in: peerTenantIds }, active: true, user: { active: true } },
      select: { tenantId: true, userId: true },
    });
    const byTenant = new Map<string, string[]>();
    for (const row of members) {
      const list = byTenant.get(row.tenantId) ?? [];
      list.push(row.userId);
      byTenant.set(row.tenantId, list);
    }
    const online = new Set(this.hub.onlineUserIds());
    for (const link of links) {
      const peerId = tenant.tenantType === "RETAILER" ? link.supplierTenantId : link.clientTenantId;
      result.set(link.id, (byTenant.get(peerId) ?? []).some((id) => online.has(id)));
    }
    return result;
  }

  private peerHref(
    link: { id: string; supplierTenant: { providerKey: string | null } },
    tenant: TenantContext
  ) {
    if (tenant.tenantType === "DISTRIBUTOR") return `/clientes/${link.id}`;
    if (link.supplierTenant.providerKey) return `/proveedores/${link.supplierTenant.providerKey}`;
    return null;
  }

  private peerOf(
    link: {
      clientTenant: { id: string; name: string; type: string; contactEmail: string | null; contactPhone: string | null };
      supplierTenant: { id: string; name: string; type: string; contactEmail: string | null; contactPhone: string | null };
    },
    tenant: TenantContext
  ) {
    const peer = tenant.tenantType === "RETAILER" ? link.supplierTenant : link.clientTenant;
    return {
      name: peer.name,
      type: peer.type,
      contactEmail: peer.contactEmail,
      contactPhone: peer.contactPhone,
    };
  }

  private preview(row: { kind: string; body: string; deletedAt: Date | null; author: { username: string } | null }) {
    if (row.deletedAt) return { kind: row.kind, text: "Mensaje eliminado", author: row.author?.username ?? null };
    if (row.kind === "IMAGE") return { kind: row.kind, text: "Foto", author: row.author?.username ?? null };
    if (row.kind === "FILE") return { kind: row.kind, text: "Archivo", author: row.author?.username ?? null };
    if (row.kind === "ORDER") return { kind: row.kind, text: row.body || "Pedido", author: row.author?.username ?? null };
    return { kind: row.kind, text: row.body.slice(0, 140), author: row.author?.username ?? null };
  }

  private serializeMessage(
    row: Prisma.ChatMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>
  ) {
    return {
      id: row.id,
      threadId: row.threadId,
      kind: row.kind,
      body: row.deletedAt ? "" : row.body,
      payload: row.deletedAt ? null : row.payload,
      author: row.author,
      replyTo: row.replyTo
        ? {
            id: row.replyTo.id,
            body: row.replyTo.deletedAt ? "Mensaje eliminado" : row.replyTo.body,
            kind: row.replyTo.kind,
            author: row.replyTo.author?.username ?? null,
          }
        : null,
      editedAt: row.editedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      reactions: this.serializeReactions(row.reactions ?? []),
    };
  }

  private serializeReactions(
    rows: { emoji: string; user: { id: string; username: string } }[]
  ) {
    const map = new Map<string, { emoji: string; users: { id: string; username: string }[] }>();
    for (const row of rows) {
      const current = map.get(row.emoji) ?? { emoji: row.emoji, users: [] };
      current.users.push(row.user);
      map.set(row.emoji, current);
    }
    return [...map.values()];
  }
}
