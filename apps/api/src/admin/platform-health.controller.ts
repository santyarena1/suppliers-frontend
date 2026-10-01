import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { JwtPayload } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { ReportClientErrorDto } from "./dto/client-error.dto";
import { PlatformHealthService } from "./platform-health.service";

/** Panel Salud del superadmin + recepción de errores del navegador. */
@Controller()
export class PlatformHealthController {
  constructor(private readonly health: PlatformHealthService) {}

  @UseGuards(RolesGuard)
  @Roles("ROLE_ADMIN")
  @Get("admin/health/overview")
  overview() {
    return this.health.overview();
  }

  @UseGuards(RolesGuard)
  @Roles("ROLE_ADMIN")
  @Get("admin/health/client-errors")
  clientErrors(@Query("take") take?: string, @Query("hours") hours?: string) {
    return this.health.listClientErrors({
      take: take ? Number(take) : undefined,
      hours: hours ? Number(hours) : undefined,
    });
  }

  /**
   * Cualquier sesión autenticada puede reportar un error de cliente.
   * Rate-limit más chico que el global para no inundar la DB.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("health/client-errors")
  report(@Body() dto: ReportClientErrorDto, @CurrentUser() user: JwtPayload) {
    return this.health.reportClientError(dto, user);
  }
}
