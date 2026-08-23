import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { JwtPayload } from "@nodo/shared";
import { CurrentTenant } from "../common/decorators/current-tenant.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RedeemAccessCodeDto } from "./dto/tenant.dto";
import type { TenantContext } from "./tenant-context.service";
import { TenantVisibilityService } from "./tenant-visibility.service";
import { TenantGuard } from "./tenant.guard";
import { TenantsService } from "./tenants.service";

/** Lo que una organización puede saber y hacer sobre sí misma, sin ser superadmin. */
@UseGuards(AuthGuard("jwt"), TenantGuard)
@Controller("my")
export class MyTenantController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly visibility: TenantVisibilityService
  ) {}

  /** Los proveedores que existen para esta organización. Para el resto, no existen. */
  @Get("providers")
  providers(@CurrentTenant() tenant: TenantContext) {
    return this.visibility.listFor(tenant.tenantId);
  }

  @Post("redeem-code")
  redeemCode(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RedeemAccessCodeDto
  ) {
    return this.tenants.redeemAccessCode(tenant, user.userId, dto.code);
  }
}
