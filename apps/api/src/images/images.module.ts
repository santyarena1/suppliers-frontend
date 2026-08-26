import { Module } from "@nestjs/common";
import { ImageSyncService } from "./image-sync.service";
import { ImagesController } from "./images.controller";
import { SerperImagesClient } from "./serper-images.client";

@Module({
  controllers: [ImagesController],
  providers: [ImageSyncService, SerperImagesClient],
})
export class ImagesModule {}
