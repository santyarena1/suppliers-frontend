import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../common/decorators/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @SkipThrottle()
  @Get()
  check() {
    return { status: "ok", uptime: process.uptime() };
  }
}
