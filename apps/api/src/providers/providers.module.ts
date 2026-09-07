import { Module } from "@nestjs/common";
import { CredentialsModule } from "../credentials/credentials.module";
import { CatalogModule } from "../catalog/catalog.module";
import { TenantsModule } from "../tenants/tenants.module";
import { ChatModule } from "../chat/chat.module";
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
import { NewTreeAdapter } from "./adapters/new-tree.adapter";
import { NewTreeAccountService } from "./new-tree-account.service";
import { NewTreeOrderService } from "./new-tree-order.service";
import { SolutionBoxAdapter } from "./adapters/solution-box.adapter";
import { SolutionBoxAccountService } from "./solution-box-account.service";
import { SolutionBoxOrderService } from "./solution-box-order.service";
import { InvidAccountService } from "./invid-account.service";
import { InvidOrderService } from "./invid-order.service";
import { NewBytesAccountService } from "./new-bytes-account.service";
import { NewBytesOrderService } from "./new-bytes-order.service";
import { GrupoNucleoOrderService } from "./grupo-nucleo-order.service";
import { AirAccountService } from "./air-account.service";
import { AirOrderService } from "./air-order.service";
import { ElitAccountService } from "./elit-account.service";
import { ElitOrderService } from "./elit-order.service";
import { OrderApprovalService } from "../orders/order-approval.service";
import { AccountPortalCache } from "./account-portal-cache";

@Module({
  imports: [CredentialsModule, TenantsModule, CatalogModule, ChatModule],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    ProviderRegistry,
    SyncSchedulerService,
    AccountPortalCache,
    ElitAdapter,
    InvidAdapter,
    AirAdapter,
    GrupoNucleoAdapter,
    NewBytesAdapter,
    CevenAdapter,
    DiapstoreAdapter,
    NewTreeAdapter,
    SolutionBoxAdapter,
    InvidAccountService,
    InvidOrderService,
    NewBytesAccountService,
    NewBytesOrderService,
    GrupoNucleoOrderService,
    AirAccountService,
    AirOrderService,
    ElitAccountService,
    ElitOrderService,
    NewTreeAccountService,
    NewTreeOrderService,
    SolutionBoxAccountService,
    SolutionBoxOrderService,
    OrderApprovalService,
  ],
  exports: [
    ProvidersService,
    ProviderRegistry,
    OrderApprovalService,
    InvidOrderService,
    NewBytesOrderService,
    GrupoNucleoOrderService,
    AirOrderService,
    ElitOrderService,
    NewTreeOrderService,
    SolutionBoxOrderService,
  ],
})
export class ProvidersModule {}
