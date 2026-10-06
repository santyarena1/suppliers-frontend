import { Module, forwardRef } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { TenantsModule } from "../tenants/tenants.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";
import { CartOrderReconcileScheduler } from "./cart-order-reconcile.scheduler";

@Module({
  imports: [TenantsModule, forwardRef(() => ChatModule)],
  controllers: [CartController],
  providers: [CartService, CartOrderReconcileScheduler],
  exports: [CartService],
})
export class CartModule {}
