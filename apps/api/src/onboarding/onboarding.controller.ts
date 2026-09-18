import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { JwtPayload } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { BootstrapRetailerOrgDto } from "./dto/onboarding.dto";
import { OnboardingService } from "./onboarding.service";

@UseGuards(AuthGuard("jwt"))
@Controller("onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get("status")
  status(@CurrentUser() user: JwtPayload) {
    return this.onboarding.status(user.userId);
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
