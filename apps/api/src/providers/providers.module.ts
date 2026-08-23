import { Module } from "@nestjs/common";
import { CredentialsModule } from "../credentials/credentials.module";
import { TenantsModule } from "../tenants/tenants.module";
import { ProvidersController } from "./providers.controller";
import { ProvidersService } from "./providers.service";
import { ProviderRegistry } from "./provider-registry";
import { SyncSchedulerService } from "./sync-scheduler.service";
import { ElitAdapter } from "./adapters/elit.adapter";
import { InvidAdapter } from "./adapters/invid.adapter";
import { AirAdapter } from "./adapters/air.adapter";
import { GrupoNucleoAdapter } from "./adapters/grupo-nucleo.adapter";
import { NewBytesAdapter } from "./adapters/new-bytes.adapter";
import { CevenAdapter } from "./adapters/ceven.adapter";
import { DiapstoreAdapter } from "./adapters/diapstore.adapter";
import { FileImportService } from "./file-import.service";
import { InvidAccountService } from "./invid-account.service";
import { InvidOrderService } from "./invid-order.service";
import { NewBytesAccountService } from "./new-bytes-account.service";
import { NewBytesOrderService } from "./new-bytes-order.service";
import { GrupoNucleoOrderService } from "./grupo-nucleo-order.service";
import { AirAccountService } from "./air-account.service";
import { AirOrderService } from "./air-order.service";
import { ElitAccountService } from "./elit-account.service";
import { ElitOrderService } from "./elit-order.service";

@Module({
  imports: [CredentialsModule, TenantsModule],
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
    CevenAdapter,
    DiapstoreAdapter,
    FileImportService,
    InvidAccountService,
    InvidOrderService,
    NewBytesAccountService,
    NewBytesOrderService,
    GrupoNucleoOrderService,
    AirAccountService,
    AirOrderService,
    ElitAccountService,
    ElitOrderService,
  ],
})
export class ProvidersModule {}
