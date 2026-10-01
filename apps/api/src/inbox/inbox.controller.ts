import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import type { JwtPayload } from "@nodo/shared";
import { TurnstileGuard } from "../auth/turnstile.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { ContactRequestDto, InboxQueryDto, SupplierJoinDto, UpdateInboxDto } from "./dto/inbox.dto";
import { InboxService } from "./inbox.service";

/** Formulario de contacto de la landing: sin sesión, con Turnstile y límite bajo. */
@Controller("contact")
export class ContactController {
  constructor(private readonly inbox: InboxService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(TurnstileGuard)
  @Post()
  contact(@Body() dto: ContactRequestDto) {
    return this.inbox.contact(dto);
  }
}

/** Usuario registrado sin organización que se presenta como distribuidor o marca. */
@UseGuards(AuthGuard("jwt"))
@Controller("my/join-request")
export class JoinRequestController {
  constructor(private readonly inbox: InboxService) {}

  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @HttpCode(HttpStatus.OK)
  @Post()
  join(@CurrentUser() user: JwtPayload, @Body() dto: SupplierJoinDto) {
    return this.inbox.supplierJoin(user.userId, dto);
  }
}

/** Bandeja "Solicitudes" en Administración. Solo superadmin. */
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/inbox")
export class AdminInboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@Query() query: InboxQueryDto) {
    return this.inbox.list(query);
  }

  @Get("pending")
  pending() {
    return this.inbox.pendingCount();
  }

  @Patch(":id")
  update(@CurrentUser() user: JwtPayload, @Param("id", new ParseUUIDPipe()) id: string, @Body() dto: UpdateInboxDto) {
    return this.inbox.update(id, user.userId, dto);
  }
}
