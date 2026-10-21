import { Module } from "@nestjs/common";
import { AcuStockClient } from "./acustock.client";
import { PlatformContentController } from "./platform-content.controller";
import { PlatformContentService } from "./platform-content.service";

@Module({
  controllers: [PlatformContentController],
  providers: [PlatformContentService, AcuStockClient],
  exports: [PlatformContentService],
})
export class PlatformContentModule {}
