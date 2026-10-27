import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { PcBuilderController } from "./pc-builder.controller";
import { PcBuilderService } from "./pc-builder.service";

/** Armados de PC guardados y la configuración del armador del comercio. */
@Module({
  imports: [TenantsModule],
  controllers: [PcBuilderController],
  providers: [PcBuilderService],
})
export class PcBuilderModule {}
