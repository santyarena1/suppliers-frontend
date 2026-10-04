import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { ApproveJoinRequestDto } from "./dto/team-invite.dto";
import type { TenantContext } from "./tenant-context.service";
import { TenantGuard } from "./tenant.guard";
import { JoinRequestsService } from "./join-requests.service";

/** Pedidos para sumarse al equipo del comercio. Quien gestiona el equipo (`team.manage`). */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my/team/join-requests")
export class MyJoinRequestsController {
  constructor(private readonly requests: JoinRequestsService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.requests.list(tenant);
  }

  @Post(":id/approve")
  approve(
    @CurrentTenant() tenant: TenantContext,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: ApproveJoinRequestDto
  ) {
    return this.requests.approve(tenant, id, dto.role);
  }

  @Post(":id/reject")
  reject(@CurrentTenant() tenant: TenantContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.requests.reject(tenant, id);
  }
}
