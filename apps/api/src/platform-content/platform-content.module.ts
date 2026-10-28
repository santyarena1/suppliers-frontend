import { Module } from "@nestjs/common";
import { AcuStockClient } from "./acustock.client";
import { PlatformContentController, PlatformContentHealthController } from "./platform-content.controller";
import { PlatformContentSchedulerService } from "./platform-content-scheduler.service";
import { PlatformContentService } from "./platform-content.service";

@Module({
  controllers: [PlatformContentController, PlatformContentHealthController],
  providers: [PlatformContentService, AcuStockClient, PlatformContentSchedulerService],
  exports: [PlatformContentService],
})
export class PlatformContentModule {}
