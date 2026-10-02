import { Module, forwardRef } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { MyTenantController } from "./my-tenant.controller";
import { PortfolioService } from "./portfolio.service";
import { TenantContextService } from "./tenant-context.service";
import { TenantPermissionsService } from "./tenant-permissions.service";
import { TenantVisibilityService } from "./tenant-visibility.service";
import { ShippingEstimatesService } from "./shipping-estimates.service";
import { TenantGuard } from "./tenant.guard";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";
import { MyTeamInvitesController, TeamInvitePreviewController } from "./team-invites.controller";
import { TeamInvitesService } from "./team-invites.service";

@Module({
  imports: [forwardRef(() => ChatModule)],
  controllers: [TenantsController, MyTenantController, MyTeamInvitesController, TeamInvitePreviewController],
  providers: [TenantsService, PortfolioService, TenantPermissionsService, TenantContextService, TenantVisibilityService, TenantGuard, ShippingEstimatesService, TeamInvitesService],
  exports: [TenantsService, TenantContextService, TenantVisibilityService, TenantGuard, TeamInvitesService],
})
export class TenantsModule {}
