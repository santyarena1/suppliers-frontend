import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { SkipThrottle } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";
import { Observable } from "rxjs";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { SkipEnvelope } from "../common/decorators/skip-envelope.decorator";
import { AssetsService } from "../assets/assets.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TenantGuard } from "../tenants/tenant.guard";
import { hasCapability, RequiresCapability } from "../tenants/entitlements";
import { assertPermission } from "../tenants/tenant-roles";
import { ChatHub } from "./chat.hub";
import { ChatService } from "./chat.service";
import {
  ChatMessagesQueryDto,
  ChatPeersQueryDto,
  ChatSearchQueryDto,
  EditChatMessageDto,
  OpenChatDto,
  PinChatMessageDto,
  ReactChatMessageDto,
  SendChatMessageDto,
  ShareOrderDto,
} from "./dto/chat.dto";

@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my/chat")
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly hub: ChatHub,
    private readonly assets: AssetsService
  ) {}

  @RequiresCapability("integratedChat")
  @Get("threads")
  threads(@CurrentTenant() tenant: TenantContext) {
    return this.chat.listThreads(tenant);
  }

  /** Sin chat en el plan el contador queda en cero: la campanita no insiste. */
  @Get("unread")
  unread(@CurrentTenant() tenant: TenantContext) {
    if (!hasCapability(tenant, "integratedChat")) return { unreadTotal: 0 };
    return this.chat.unreadTotal(tenant);
  }

  @RequiresCapability("integratedChat")
  @Get("search")
  search(@CurrentTenant() tenant: TenantContext, @Query() query: ChatSearchQueryDto) {
    return this.chat.search(tenant, query.q, query.take);
  }

  @RequiresCapability("integratedChat")
  @Get("peers")
  peers(@CurrentTenant() tenant: TenantContext, @Query() query: ChatPeersQueryDto) {
    return this.chat.listPeers(tenant, query.linkId);
  }

  @RequiresCapability("integratedChat")
  @Post("open")
  open(@CurrentTenant() tenant: TenantContext, @Body() dto: OpenChatDto) {
    return this.chat.open(tenant, dto.linkId, dto.peerUserId);
  }

  @RequiresCapability("integratedChat")
  @Post("share-order")
  shareOrder(@CurrentTenant() tenant: TenantContext, @Body() dto: ShareOrderDto) {
    return this.chat.shareOrder(tenant, dto.orderId, dto.threadId);
  }

  @RequiresCapability("integratedChat")
  @Get("threads/:threadId")
  thread(@CurrentTenant() tenant: TenantContext, @Param("threadId") threadId: string) {
    return this.chat.getThread(tenant, threadId);
  }

  @RequiresCapability("integratedChat")
  @Get("threads/:threadId/messages")
  messages(
    @CurrentTenant() tenant: TenantContext,
    @Param("threadId") threadId: string,
    @Query() query: ChatMessagesQueryDto
  ) {
    return this.chat.listMessages(tenant, threadId, { before: query.before, take: query.take });
  }

  @RequiresCapability("integratedChat")
  @Post("threads/:threadId/messages")
  send(
    @CurrentTenant() tenant: TenantContext,
    @Param("threadId") threadId: string,
    @Body() dto: SendChatMessageDto
  ) {
    return this.chat.send(tenant, threadId, dto);
  }

  @RequiresCapability("integratedChat")
  @Post("threads/:threadId/read")
  read(@CurrentTenant() tenant: TenantContext, @Param("threadId") threadId: string) {
    return this.chat.markRead(tenant, threadId);
  }

  @RequiresCapability("integratedChat")
  @Post("threads/:threadId/typing")
  typing(@CurrentTenant() tenant: TenantContext, @Param("threadId") threadId: string) {
    return this.chat.typing(tenant, threadId);
  }

  @RequiresCapability("integratedChat")
  @Post("threads/:threadId/pins")
  pin(
    @CurrentTenant() tenant: TenantContext,
    @Param("threadId") threadId: string,
    @Body() dto: PinChatMessageDto
  ) {
    return this.chat.pin(tenant, threadId, dto.messageId);
  }

  @RequiresCapability("integratedChat")
  @Delete("threads/:threadId/pins/:messageId")
  unpin(
    @CurrentTenant() tenant: TenantContext,
    @Param("threadId") threadId: string,
    @Param("messageId") messageId: string
  ) {
    return this.chat.unpin(tenant, threadId, messageId);
  }

  @RequiresCapability("integratedChat")
  @Patch("messages/:messageId")
  edit(
    @CurrentTenant() tenant: TenantContext,
    @Param("messageId") messageId: string,
    @Body() dto: EditChatMessageDto
  ) {
    return this.chat.edit(tenant, messageId, dto.body);
  }

  @RequiresCapability("integratedChat")
  @Delete("messages/:messageId")
  remove(@CurrentTenant() tenant: TenantContext, @Param("messageId") messageId: string) {
    return this.chat.remove(tenant, messageId);
  }

  @RequiresCapability("integratedChat")
  @Post("messages/:messageId/reactions")
  react(
    @CurrentTenant() tenant: TenantContext,
    @Param("messageId") messageId: string,
    @Body() dto: ReactChatMessageDto
  ) {
    return this.chat.react(tenant, messageId, dto.emoji);
  }

  @RequiresCapability("integratedChat")
  @Post("upload")
  async upload(@CurrentTenant() tenant: TenantContext, @Req() req: FastifyRequest) {
    assertPermission(tenant, "chat.write");
    const file = await req.file();
    if (!file) throw new BadRequestException("No se recibió ningún archivo");
    const buffer = await file.toBuffer();
    // Privado: solo se sirve con link firmado a quien ve la conversación.
    return this.assets.saveChatFile(
      {
        filename: file.filename,
        mimetype: file.mimetype,
        buffer,
      },
      tenant.tenantId
    );
  }

  @Sse("stream")
  @SkipEnvelope()
  @SkipThrottle()
  async stream(@CurrentTenant() tenant: TenantContext): Promise<Observable<MessageEvent>> {
    const username = await this.chat.usernameOf(tenant.userId);
    return new Observable((subscriber) => {
      const write = (event: { type: string; threadId?: string; data: unknown }) => {
        subscriber.next({
          type: event.type,
          data: { threadId: event.threadId, data: event.data },
        });
      };
      write({ type: "hello", data: { userId: tenant.userId, username } });
      if (!hasCapability(tenant, "integratedChat")) {
        write({ type: "unread", data: { unreadTotal: 0 } });
        const idle = setInterval(() => subscriber.next({ type: "ping", data: {} }), 25000);
        return () => clearInterval(idle);
      }
      void this.chat.unreadTotal(tenant).then((unread) => write({ type: "unread", data: unread }));
      const off = this.hub.subscribe(tenant.userId, tenant.tenantId, username, write);
      const ping = setInterval(() => {
        subscriber.next({ type: "ping", data: {} });
      }, 25000);
      return () => {
        clearInterval(ping);
        off();
      };
    });
  }
}
