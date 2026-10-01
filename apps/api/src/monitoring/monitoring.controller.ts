import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { SystemHealthService } from "./system-health.service";

/** "Salud del sistema" en Administración. Solo superadmin. */
@UseGuards(RolesGuard)
@Roles("ROLE_ADMIN")
@Controller("admin/health")
export class MonitoringController {
  constructor(private readonly health: SystemHealthService) {}

  @SkipThrottle()
  @Get("overview")
  overview(@Query("hours") hours?: string) {
    return this.health.overview(hours);
  }
}
