import { Module } from "@nestjs/common";
import { AssetsModule } from "../assets/assets.module";
import { ImageSyncSchedulerService } from "./image-sync-scheduler.service";
import { ImageSyncService } from "./image-sync.service";
import { ImagesController } from "./images.controller";
import { SerperImagesClient } from "./serper-images.client";

@Module({
  imports: [AssetsModule],
  controllers: [ImagesController],
  providers: [ImageSyncService, SerperImagesClient, ImageSyncSchedulerService],
})
export class ImagesModule {}
