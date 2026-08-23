import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { CredentialsController } from "./credentials.controller";
import { CredentialsService } from "./credentials.service";

@Module({
  imports: [TenantsModule],
  controllers: [CredentialsController],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
