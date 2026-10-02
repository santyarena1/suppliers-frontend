import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { Public } from "../common/decorators/public.decorator";
import { CreateTeamInviteDto } from "./dto/team-invite.dto";
import type { TenantContext } from "./tenant-context.service";
import { TenantGuard } from "./tenant.guard";
import { TeamInvitesService } from "./team-invites.service";

/** Códigos de invitación al equipo del comercio. Quien gestiona el equipo (`team.manage`). */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my/team/invite-codes")
export class MyTeamInvitesController {
  constructor(private readonly invites: TeamInvitesService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.invites.list(tenant);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateTeamInviteDto) {
    return this.invites.create(tenant, dto);
  }

  @Delete(":id")
  revoke(@CurrentTenant() tenant: TenantContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.invites.revoke(tenant, id);
  }
}

/** Para el registro: a qué comercio y con qué rol entra quien trae el código. */
@Controller("team-invites")
export class TeamInvitePreviewController {
  constructor(private readonly invites: TeamInvitesService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(":code/preview")
  preview(@Param("code") code: string) {
    return this.invites.preview(code);
  }
}
