import { Module } from "@nestjs/common";
import { ChatService } from "./chat.service";
import { MyTenantController } from "./my-tenant.controller";
import { PortfolioService } from "./portfolio.service";
import { TenantContextService } from "./tenant-context.service";
import { TenantVisibilityService } from "./tenant-visibility.service";
import { TenantGuard } from "./tenant.guard";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  controllers: [TenantsController, MyTenantController],
  providers: [
    TenantsService,
    TenantContextService,
    TenantVisibilityService,
    TenantGuard,
    PortfolioService,
    ChatService,
  ],
  exports: [TenantsService, TenantContextService, TenantVisibilityService, TenantGuard],
})
export class TenantsModule {}
