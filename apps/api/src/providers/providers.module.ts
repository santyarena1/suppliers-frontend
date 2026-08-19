import { Module } from "@nestjs/common";
import { CredentialsModule } from "../credentials/credentials.module";
import { ProvidersController } from "./providers.controller";
import { ProvidersService } from "./providers.service";
import { ProviderRegistry } from "./provider-registry";
import { ElitAdapter } from "./adapters/elit.adapter";
import { InvidAdapter } from "./adapters/invid.adapter";
import { AirAdapter } from "./adapters/air.adapter";
import { GrupoNucleoAdapter } from "./adapters/grupo-nucleo.adapter";
import { NewBytesAdapter } from "./adapters/new-bytes.adapter";

@Module({
  imports: [CredentialsModule],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    ProviderRegistry,
    ElitAdapter,
    InvidAdapter,
    AirAdapter,
    GrupoNucleoAdapter,
    NewBytesAdapter,
  ],
})
export class ProvidersModule {}
