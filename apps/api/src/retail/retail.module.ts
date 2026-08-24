import { Module } from "@nestjs/common";
import { RetailSourceClient } from "./retail-source.client";
import { RetailIngestService } from "./retail-ingest.service";
import { RetailSearchService } from "./retail-search.service";
import { RetailSchedulerService } from "./retail-scheduler.service";
import { RetailController } from "./retail.controller";

@Module({
  controllers: [RetailController],
  providers: [RetailSourceClient, RetailIngestService, RetailSearchService, RetailSchedulerService],
  exports: [RetailSearchService, RetailIngestService],
})
export class RetailModule {}
