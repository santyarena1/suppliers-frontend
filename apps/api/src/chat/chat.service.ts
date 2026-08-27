import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  isChatReactionEmoji,
  PROVIDER_LABELS,
  TENANT_ROLE_LABELS,
  tenantCanWriteChat,
  type Provider,
  type TenantRole,
  type TenantType,
} from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { canWriteChat, chatLinkVisibleTo, chatThreadVisibleTo, type ChatActor } from "./chat.access";
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

const PERSON_SELECT = { id: true, username: true, email: true } satisfies Prisma.UserSelect;

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

const THREAD_INCLUDE = {
  link: { select: LINK_SELECT },
  distroUser: { select: PERSON_SELECT },
  storeUser: { select: PERSON_SELECT },
} satisfies Prisma.ChatThreadInclude;

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_PINS = 5;

type LinkRow = Prisma.TenantLinkGetPayload<{ select: typeof LINK_SELECT }>;
type PersonRow = { id: string; username: string; email: string };
type ChatPeer = {
  userId: string;
  username: string;
  name: string;
  role: TenantRole | null;
  roleLabel: string;
  orgName: string;
  type: TenantType;
  contactEmail: string | null;
  contactPhone: string | null;
  isAccountManager: boolean;
};

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: ChatHub
  ) {}

  async listThreads(tenant: TenantContext) {
    const links = await this.visibleLinks(tenant);
    const linkIds = links.map((link) => link.id);
    const mine =
      tenant.tenantType === "DISTRIBUTOR"
        ? { distroUserId: tenant.userId }
        : { storeUserId: tenant.userId };
    const threads = await this.prisma.chatThread.findMany({
      where: { linkId: { in: linkIds }, ...mine },
      include: {
        ...THREAD_INCLUDE,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { author: { select: { username: true } } },
        },
      },
    });
    const roles = await this.rolesFor(
      threads.flatMap((row) => [
        { userId: row.distroUserId, tenantId: row.link.supplierTenantId },
        { userId: row.storeUserId, tenantId: row.link.clientTenantId },
      ])
    );
    const threadIds = threads.map((row) => row.id);
    const unreadByThread = await this.countUnreads(tenant.userId, threadIds);
    const online = new Set(this.hub.onlineUserIds());

    const items: Array<{
      threadId: string | null;
      linkId: string;
      status: LinkRow["status"];
      peer: ChatPeer;
      accountManager: LinkRow["accountManager"];
      lastMessage: ReturnType<ChatService["preview"]> | null;
      lastMessageAt: string | null;
      unreadCount: number;
      peerOnline: boolean;
      peerHref: string | null;
    }> = threads.map((thread) => {
      const last = thread.messages[0];
      const peer = this.peerOf(thread.link, tenant, thread.distroUser, thread.storeUser, roles);
      return {
        threadId: thread.id,
        linkId: thread.linkId,
        status: thread.link.status,
        peer,
        accountManager: thread.link.accountManager,
        lastMessage: last ? this.preview(last) : null,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
        unreadCount: unreadByThread.get(thread.id) ?? 0,
        peerOnline: online.has(peer.userId),
        peerHref: this.peerHref(thread.link, tenant),
      };
    });

    if (canWriteChat(tenant.tenantRole, tenant.tenantType)) {
      const peopleCache = new Map<string, Awaited<ReturnType<ChatService["peopleWhoCanChat"]>>>();
      const peopleOf = async (tenantId: string, type: TenantType) => {
        const key = `${type}:${tenantId}`;
        const hit = peopleCache.get(key);
        if (hit) return hit;
        const rows = await this.peopleWhoCanChat(tenantId, type);
        peopleCache.set(key, rows);
        return rows;
      };
      const have = new Set(
        threads.map((row) => `${row.linkId}:${tenant.tenantType === "DISTRIBUTOR" ? row.storeUserId : row.distroUserId}`)
      );
      for (const link of links) {
        const defPeople =
          tenant.tenantType === "DISTRIBUTOR"
            ? await peopleOf(link.clientTenantId, "RETAILER")
            : await peopleOf(link.supplierTenantId, "DISTRIBUTOR");
        const assigned =
          tenant.tenantType === "RETAILER" && link.accountManagerId
            ? defPeople.find((row) => row.id === link.accountManagerId)
            : null;
        const def = assigned ?? defPeople[0];
        if (!def || have.has(`${link.id}:${def.id}`)) continue;
        const peer = this.peerFromPerson(link, tenant, def);
        items.push({
          threadId: null,
          linkId: link.id,
          status: link.status,
          peer,
          accountManager: link.accountManager,
          lastMessage: null,
          lastMessageAt: null,
          unreadCount: 0,
          peerOnline: online.has(peer.userId),
          peerHref: this.peerHref(link, tenant),
        });
      }
    }

    items.sort((a, b) => {
      const ta = a.lastMessageAt ?? "";
      const tb = b.lastMessageAt ?? "";
      if (ta === tb) return a.peer.name.localeCompare(b.peer.name, "es");
      return tb.localeCompare(ta);
    });
    const unreadTotal = items.reduce((sum, item) => sum + item.unreadCount, 0);
    return { canWrite: canWriteChat(tenant.tenantRole, tenant.tenantType), unreadTotal, threads: items };
  }

  async listPeers(tenant: TenantContext, linkId: string) {
    const link = await this.requireLink(tenant, linkId);
    const otherType: TenantType = tenant.tenantType === "RETAILER" ? "DISTRIBUTOR" : "RETAILER";
    const otherTenantId = tenant.tenantType === "RETAILER" ? link.supplierTenantId : link.clientTenantId;
    const people = await this.peopleWhoCanChat(otherTenantId, otherType);
    const mine =
      tenant.tenantType === "DISTRIBUTOR"
        ? { distroUserId: tenant.userId, linkId }
        : { storeUserId: tenant.userId, linkId };
    const existing = await this.prisma.chatThread.findMany({
      where: mine,
      select: { distroUserId: true, storeUserId: true },
    });
    const threaded = new Set(
      existing.map((row) => (tenant.tenantType === "DISTRIBUTOR" ? row.storeUserId : row.distroUserId))
    );
    const def = await this.defaultPeer(tenant, link);
    return {
      linkId: link.id,
      peers: people.map((person) => ({
        userId: person.id,
        username: person.username,
        role: person.role,
        roleLabel: TENANT_ROLE_LABELS[person.role],
        isAccountManager: person.id === link.accountManagerId,
        isDefault: def?.id === person.id,
        hasThread: threaded.has(person.id),
      })),
    };
  }

  async open(tenant: TenantContext, linkId: string, peerUserId?: string) {
    const link = await this.requireLink(tenant, linkId);
    const pair = await this.resolvePair(tenant, link, peerUserId);
    const thread = await this.upsertPair(pair.distroUserId, pair.storeUserId, link.id);
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
    this.hub.emitToUsers(this.pairIds(thread), { type: "message", threadId, data: message });
    return message;
  }

  async edit(tenant: TenantContext, messageId: string, body: string) {
    this.assertWrite(tenant);
    const row = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!row || row.deletedAt) throw new NotFoundException("Mensaje no encontrado");
    const thread = await this.requireThread(tenant, row.threadId);
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
    this.hub.emitToUsers(this.pairIds(thread), { type: "message_edited", threadId: row.threadId, data: message });
    return message;
  }

  async remove(tenant: TenantContext, messageId: string) {
    this.assertWrite(tenant);
    const row = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!row || row.deletedAt) throw new NotFoundException("Mensaje no encontrado");
    const thread = await this.requireThread(tenant, row.threadId);
    const ownOrg = row.authorUserId === tenant.userId;
    const admin = tenant.tenantRole === "OWNER" || tenant.tenantRole === "ADMIN";
    if (!ownOrg && !admin) throw new ForbiddenException("No podés borrar ese mensaje");
    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: "", payload: Prisma.JsonNull },
      include: MESSAGE_INCLUDE,
    });
    const message = this.serializeMessage(updated);
    this.hub.emitToUsers(this.pairIds(thread), { type: "message_deleted", threadId: row.threadId, data: message });
    return message;
  }

  async markRead(tenant: TenantContext, threadId: string) {
    const thread = await this.requireThread(tenant, threadId);
    await this.touchRead(threadId, tenant.userId, new Date());
    this.hub.emitToUsers(this.pairIds(thread), {
      type: "read",
      threadId,
      data: { userId: tenant.userId, lastReadAt: new Date().toISOString() },
    });
    return { threadId, lastReadAt: new Date().toISOString() };
  }

  async typing(tenant: TenantContext, threadId: string) {
    this.assertWrite(tenant);
    const thread = await this.requireThread(tenant, threadId);
    const username = await this.usernameOf(tenant.userId);
    const typing = this.hub.setTyping(threadId, tenant.userId, username);
    this.hub.emitToUsers(this.pairIds(thread), { type: "typing", threadId, data: typing });
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
    this.hub.emitToUsers(this.pairIds(thread), {
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
    const listed = await this.listThreads(tenant);
    const threadIds = listed.threads.map((row) => row.threadId).filter((id): id is string => Boolean(id));
    if (threadIds.length === 0) return { messages: [] };
    const byThread = new Map(listed.threads.filter((row) => row.threadId).map((row) => [row.threadId as string, row.peer]));
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        threadId: { in: threadIds },
        deletedAt: null,
        body: { contains: needle, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      take,
      include: MESSAGE_INCLUDE,
    });
    return {
      messages: rows.map((row) => {
        const peer = byThread.get(row.threadId);
        return {
          ...this.serializeMessage(row),
          threadId: row.threadId,
          peerName: peer ? `${peer.username} · ${peer.orgName}` : "",
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
        select: LINK_SELECT,
      });
      if (!link) return;
      const storeUserId = await this.storeAuthorOrDefault(link, order.createdByUserId);
      const distroUserId = (await this.defaultDistroPeer(link))?.id;
      if (!storeUserId || !distroUserId) return;
      const thread = await this.upsertPair(distroUserId, storeUserId, link.id);
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
      this.hub.emitToUsers(this.pairIds(thread), { type: "message", threadId: thread.id, data: this.serializeMessage(row) });
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
      const threads = await this.prisma.chatThread.findMany({ where: { linkId } });
      for (const thread of threads) {
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
        this.hub.emitToUsers(this.pairIds(thread), { type: "message", threadId: thread.id, data: this.serializeMessage(row) });
      }
    } catch {
      // El vínculo se guarda aunque el aviso no salga.
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
      include: THREAD_INCLUDE,
    });
    if (!thread || !chatThreadVisibleTo(thread, this.actor(tenant))) {
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
      select: LINK_SELECT,
    });
    if (!link || !chatLinkVisibleTo(link, this.actor(tenant))) return null;
    const pair = await this.resolvePair(tenant, link);
    return this.upsertPair(pair.distroUserId, pair.storeUserId, link.id);
  }

  private pairIds(thread: { distroUserId: string; storeUserId: string }) {
    return [thread.distroUserId, thread.storeUserId];
  }

  private async upsertPair(distroUserId: string, storeUserId: string, linkId: string) {
    return this.prisma.chatThread.upsert({
      where: {
        linkId_distroUserId_storeUserId: { linkId, distroUserId, storeUserId },
      },
      create: { linkId, distroUserId, storeUserId },
      update: {},
    });
  }

  private async resolvePair(tenant: TenantContext, link: LinkRow, peerUserId?: string) {
    if (tenant.tenantType === "DISTRIBUTOR") {
      const store = peerUserId
        ? await this.requirePerson(link.clientTenantId, "RETAILER", peerUserId)
        : await this.defaultStorePeer(link);
      if (!store) throw new BadRequestException("No hay nadie en el comercio con quien hablar");
      return { distroUserId: tenant.userId, storeUserId: store.id };
    }
    if (tenant.tenantType === "RETAILER") {
      const distro = peerUserId
        ? await this.requirePerson(link.supplierTenantId, "DISTRIBUTOR", peerUserId)
        : await this.defaultDistroPeer(link);
      if (!distro) throw new BadRequestException("No hay nadie en el distribuidor con quien hablar");
      return { distroUserId: distro.id, storeUserId: tenant.userId };
    }
    throw new ForbiddenException("Este chat es entre comercio y distribuidor");
  }

  private async defaultPeer(tenant: TenantContext, link: LinkRow) {
    return tenant.tenantType === "DISTRIBUTOR" ? this.defaultStorePeer(link) : this.defaultDistroPeer(link);
  }

  private async defaultDistroPeer(link: LinkRow) {
    const people = await this.peopleWhoCanChat(link.supplierTenantId, "DISTRIBUTOR");
    const assigned = link.accountManagerId ? people.find((row) => row.id === link.accountManagerId) : null;
    return assigned ?? people[0] ?? null;
  }

  private async defaultStorePeer(link: LinkRow) {
    const people = await this.peopleWhoCanChat(link.clientTenantId, "RETAILER");
    return people[0] ?? null;
  }

  private async storeAuthorOrDefault(link: LinkRow, createdByUserId: string | null) {
    if (createdByUserId) {
      const people = await this.peopleWhoCanChat(link.clientTenantId, "RETAILER");
      const author = people.find((row) => row.id === createdByUserId);
      if (author) return author.id;
    }
    return (await this.defaultStorePeer(link))?.id ?? null;
  }

  private async requirePerson(tenantId: string, type: TenantType, userId: string) {
    const people = await this.peopleWhoCanChat(tenantId, type);
    const person = people.find((row) => row.id === userId);
    if (!person) throw new NotFoundException("Esa persona no está en el chat de esta cuenta");
    return person;
  }

  private async peopleWhoCanChat(tenantId: string, type: TenantType) {
    const members = await this.prisma.tenantMembership.findMany({
      where: { tenantId, active: true, user: { active: true } },
      select: {
        userId: true,
        role: true,
        title: true,
        user: { select: PERSON_SELECT },
      },
      orderBy: { createdAt: "asc" },
    });
    const rank: Record<string, number> = {
      OWNER: 0,
      ADMIN: 1,
      BUYER: 2,
      SELLER: 2,
      PRODUCT_MANAGER: 3,
    };
    return members
      .filter((row) => tenantCanWriteChat(type, row.role as TenantRole))
      .sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9))
      .map((row) => ({
        ...row.user,
        role: row.role as TenantRole,
        title: row.title,
      }));
  }

  private async rolesFor(pairs: Array<{ userId: string; tenantId: string }>) {
    const map = new Map<string, TenantRole>();
    if (pairs.length === 0) return map;
    const rows = await this.prisma.tenantMembership.findMany({
      where: {
        OR: pairs.map((pair) => ({ userId: pair.userId, tenantId: pair.tenantId })),
      },
      select: { userId: true, tenantId: true, role: true },
    });
    for (const row of rows) map.set(`${row.tenantId}:${row.userId}`, row.role as TenantRole);
    return map;
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
    const [pins, read, roles] = await Promise.all([
      this.prisma.chatPin.findMany({
        where: { threadId },
        include: { message: { include: MESSAGE_INCLUDE } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.chatRead.findUnique({
        where: { threadId_userId: { threadId, userId: tenant.userId } },
      }),
      this.rolesFor([
        { userId: thread.distroUserId, tenantId: thread.link.supplierTenantId },
        { userId: thread.storeUserId, tenantId: thread.link.clientTenantId },
      ]),
    ]);
    const peer = this.peerOf(thread.link, tenant, thread.distroUser, thread.storeUser, roles);
    const peerRead = await this.prisma.chatRead.findUnique({
      where: { threadId_userId: { threadId, userId: peer.userId } },
    });
    const online = new Set(this.hub.onlineUserIds());
    return {
      threadId: thread.id,
      linkId: thread.linkId,
      status: thread.link.status,
      canWrite: canWriteChat(tenant.tenantRole, tenant.tenantType),
      peer,
      accountManager: thread.link.accountManager,
      lastReadAt: read?.lastReadAt.toISOString() ?? null,
      peerLastReadAt: peerRead?.lastReadAt.toISOString() ?? null,
      peerReads: peerRead
        ? [{ userId: peer.userId, username: peer.username, lastReadAt: peerRead.lastReadAt.toISOString() }]
        : [],
      peerOnline: online.has(peer.userId),
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

  private peerHref(
    link: { id: string; supplierTenant: { providerKey: string | null } },
    tenant: TenantContext
  ) {
    if (tenant.tenantType === "DISTRIBUTOR") return `/clientes/${link.id}`;
    if (link.supplierTenant.providerKey) return `/proveedores/${link.supplierTenant.providerKey}`;
    return null;
  }

  private peerOf(
    link: LinkRow,
    tenant: TenantContext,
    distroUser: PersonRow,
    storeUser: PersonRow,
    roles: Map<string, TenantRole>
  ): ChatPeer {
    const person = tenant.tenantType === "RETAILER" ? distroUser : storeUser;
    const org = tenant.tenantType === "RETAILER" ? link.supplierTenant : link.clientTenant;
    const roleKey = `${org.id}:${person.id}`;
    const role = roles.get(roleKey) ?? null;
    return {
      userId: person.id,
      username: person.username,
      name: person.username,
      role,
      roleLabel: role ? TENANT_ROLE_LABELS[role] : "",
      orgName: org.name,
      type: org.type as TenantType,
      contactEmail: org.contactEmail,
      contactPhone: org.contactPhone,
      isAccountManager: person.id === link.accountManagerId,
    };
  }

  private peerFromPerson(
    link: LinkRow,
    tenant: TenantContext,
    person: PersonRow & { role: TenantRole }
  ): ChatPeer {
    const org = tenant.tenantType === "RETAILER" ? link.supplierTenant : link.clientTenant;
    return {
      userId: person.id,
      username: person.username,
      name: person.username,
      role: person.role,
      roleLabel: TENANT_ROLE_LABELS[person.role],
      orgName: org.name,
      type: org.type as TenantType,
      contactEmail: org.contactEmail,
      contactPhone: org.contactPhone,
      isAccountManager: person.id === link.accountManagerId,
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
