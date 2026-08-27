import { Module, forwardRef } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { MyTenantController } from "./my-tenant.controller";
import { PortfolioService } from "./portfolio.service";
import { TenantContextService } from "./tenant-context.service";
import { TenantVisibilityService } from "./tenant-visibility.service";
import { TenantGuard } from "./tenant.guard";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [forwardRef(() => ChatModule)],
  controllers: [TenantsController, MyTenantController],
  providers: [TenantsService, PortfolioService, TenantContextService, TenantVisibilityService, TenantGuard],
  exports: [TenantsService, TenantContextService, TenantVisibilityService, TenantGuard],
})
export class TenantsModule {}
