import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { RetailSourceClient } from "./retail-source.client";
import { RetailHardgamersClient } from "./retail-hardgamers.client";
import { RetailCompragamerClient } from "./retail-compragamer.client";
import { RetailIngestService } from "./retail-ingest.service";
import { RetailSearchService } from "./retail-search.service";
import { RetailSchedulerService } from "./retail-scheduler.service";
import { RetailController } from "./retail.controller";
import { OwnStoreController } from "./own-store.controller";
import { OwnStoreService } from "./own-store.service";

@Module({
  imports: [TenantsModule],
  controllers: [RetailController, OwnStoreController],
  providers: [
    RetailSourceClient,
    RetailHardgamersClient,
    RetailCompragamerClient,
    RetailIngestService,
    RetailSearchService,
    RetailSchedulerService,
    OwnStoreService,
  ],
  exports: [RetailSearchService, RetailIngestService],
})
export class RetailModule {}
