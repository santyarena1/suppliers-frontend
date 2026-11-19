import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { SubscriptionRemindersService } from "./subscription-reminders.service";
import { AdminSubscriptionsController, MySubscriptionController } from "./subscriptions.controller";
import { RetailersJoinedController } from "./retailers-joined.controller";
import { SubscriptionsService } from "./subscriptions.service";
import { MercadoPagoCheckoutService } from "./mercadopago-checkout.service";
import { FxService } from "../catalog-api/core/fx.service";

@Module({
  imports: [TenantsModule],
  controllers: [MySubscriptionController, AdminSubscriptionsController, RetailersJoinedController],
  providers: [SubscriptionsService, SubscriptionRemindersService, MercadoPagoCheckoutService, FxService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
