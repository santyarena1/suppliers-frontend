import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { SubscriptionRemindersService } from "./subscription-reminders.service";
import { AdminSubscriptionsController, MySubscriptionController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  imports: [TenantsModule],
  controllers: [MySubscriptionController, AdminSubscriptionsController],
  providers: [SubscriptionsService, SubscriptionRemindersService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
