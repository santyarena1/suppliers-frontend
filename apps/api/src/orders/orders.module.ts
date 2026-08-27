import { Module } from "@nestjs/common";
import { CredentialsModule } from "../credentials/credentials.module";
import { ProvidersModule } from "../providers/providers.module";
import { TenantsModule } from "../tenants/tenants.module";
import { ChatModule } from "../chat/chat.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [ProvidersModule, CredentialsModule, TenantsModule, ChatModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
