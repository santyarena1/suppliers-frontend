import { Body, Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { JwtPayload } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { AdminCreateRetailerDto, BootstrapRetailerOrgDto, OnboardingStepDto } from "./dto/onboarding.dto";
import { OnboardingService } from "./onboarding.service";
import { Throttle } from "@nestjs/throttler";
import { CreateJoinRequestDto, JoinTeamDto } from "../tenants/dto/team-invite.dto";
import { TeamInvitesService } from "../tenants/team-invites.service";
import { JoinRequestsService } from "../tenants/join-requests.service";
import { TenantContextService } from "../tenants/tenant-context.service";

@UseGuards(AuthGuard("jwt"))
@Controller("onboarding")
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly invites: TeamInvitesService,
    private readonly joinRequests: JoinRequestsService,
    private readonly tenantContext: TenantContextService
  ) {}

  @Get("status")
  status(@CurrentUser() user: JwtPayload) {
    return this.onboarding.status(user.userId);
  }

  /** Entrar al equipo de un comercio con el código que te pasaron. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("join-team")
  async joinTeam(@CurrentUser() user: JwtPayload, @Body() dto: JoinTeamDto) {
    const joined = await this.invites.redeem(user.userId, dto.code);
    return { ...joined, ...(await this.onboarding.sessionAfterJoin(user.userId)) };
  }

  /** Sin código: pedirle al dueño de un comercio (por su mail) sumarse a su equipo. */
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @Post("join-request")
  requestToJoin(@CurrentUser() user: JwtPayload, @Body() dto: CreateJoinRequestDto) {
    return this.joinRequests.request(user.userId, dto.ownerEmail);
  }

  /**
   * El pedido propio. Si ya lo aprobaron (la persona tiene organización), trae
   * la sesión nueva para entrar sin volver a loguearse.
   */
  @Get("join-request")
  async myJoinRequest(@CurrentUser() user: JwtPayload) {
    const request = await this.joinRequests.mine(user.userId);
    const tenant = await this.tenantContext.forUser(user.userId);
    if (tenant && request?.status === "APPROVED") {
      return { request, joined: await this.onboarding.sessionAfterJoin(user.userId) };
    }
    return { request, joined: null };
  }

  @Delete("join-request")
  cancelJoinRequest(@CurrentUser() user: JwtPayload) {
    return this.joinRequests.cancel(user.userId);
  }

  @Post("bootstrap")
  bootstrap(@CurrentUser() user: JwtPayload, @Body() dto: BootstrapRetailerOrgDto) {
    return this.onboarding.bootstrapRetailer(user.userId, dto);
  }

  /** Comercio ya creado: salta org/plan y arranca el tour interactivo. */
  @Post("start-tour")
  startTour(@CurrentUser() user: JwtPayload) {
    return this.onboarding.startTour(user.userId);
  }

  /** Superadmin: suelta Administración y hace el onboarding desde cero. */
  @Post("preview")
  preview(@CurrentUser() user: JwtPayload) {
    return this.onboarding.enterPreview(user.userId);
  }

  @Post("preview/exit")
  exitPreview(@CurrentUser() user: JwtPayload) {
    return this.onboarding.exitPreview(user.userId, { markComplete: true });
  }

  /** Guarda el paso del recorrido en el que está la persona. */
  @Post("step")
  step(@CurrentUser() user: JwtPayload, @Body() dto: OnboardingStepDto) {
    return this.onboarding.setStep(user.userId, dto.step);
  }

  @Post("complete")
  complete(@CurrentUser() user: JwtPayload) {
    return this.onboarding.complete(user.userId);
  }

  @Post("reopen")
  reopen(@CurrentUser() user: JwtPayload) {
    return this.onboarding.reopen(user.userId);
  }

  @Post("reseed-demo")
  reseed(@CurrentUser() user: JwtPayload) {
    return this.onboarding.reseedDemo(user.userId);
  }
}

/** Superadmin: alta de un comercio completo (org PRO + dueño + demo + recorrido). */
@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/onboarding")
export class AdminOnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly invites: TeamInvitesService
  ) {}

  @Post("retailers")
  createRetailer(@Body() dto: AdminCreateRetailerDto) {
    return this.onboarding.createRetailerForAdmin(dto);
  }
}
