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
