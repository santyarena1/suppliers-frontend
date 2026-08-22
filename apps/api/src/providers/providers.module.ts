import { Module } from "@nestjs/common";
import { CredentialsModule } from "../credentials/credentials.module";
import { ProvidersController } from "./providers.controller";
import { ProvidersService } from "./providers.service";
import { ProviderRegistry } from "./provider-registry";
import { SyncSchedulerService } from "./sync-scheduler.service";
import { ElitAdapter } from "./adapters/elit.adapter";
import { InvidAdapter } from "./adapters/invid.adapter";
import { AirAdapter } from "./adapters/air.adapter";
import { GrupoNucleoAdapter } from "./adapters/grupo-nucleo.adapter";
import { NewBytesAdapter } from "./adapters/new-bytes.adapter";
import { FileImportService } from "./file-import.service";
import { InvidAccountService } from "./invid-account.service";
import { InvidOrderService } from "./invid-order.service";

@Module({
  imports: [CredentialsModule],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    ProviderRegistry,
    SyncSchedulerService,
    ElitAdapter,
    InvidAdapter,
    AirAdapter,
    GrupoNucleoAdapter,
    NewBytesAdapter,
    FileImportService,
    InvidAccountService,
    InvidOrderService,
  ],
})
export class ProvidersModule {}
