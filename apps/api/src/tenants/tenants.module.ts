import { Module } from "@nestjs/common";
import { TenantContextService } from "./tenant-context.service";
import { TenantGuard } from "./tenant.guard";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantContextService, TenantGuard],
  exports: [TenantsService, TenantContextService, TenantGuard],
})
export class TenantsModule {}
