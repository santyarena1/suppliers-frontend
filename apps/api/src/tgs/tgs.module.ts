import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { TgsAccessService } from "./tgs.access";
import { TgsClient } from "./tgs.client";
import { TgsController } from "./tgs.controller";
import { TgsKeysService } from "./tgs.keys";
import { TgsService } from "./tgs.service";

@Module({
  imports: [TenantsModule],
  controllers: [TgsController],
  providers: [TgsClient, TgsService, TgsAccessService, TgsKeysService],
  exports: [TgsAccessService],
})
export class TgsModule {}
