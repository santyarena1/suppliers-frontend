import { Global, Module } from "@nestjs/common";
import { TurnstileGuard } from "../auth/turnstile.guard";
import { AdminInboxController, ContactController, JoinRequestController, MyRequestsController } from "./inbox.controller";
import { InboxService } from "./inbox.service";

/** Global: registro, onboarding y suscripciones cargan solicitudes desde sus módulos. */
@Global()
@Module({
  controllers: [ContactController, JoinRequestController, MyRequestsController, AdminInboxController],
  providers: [InboxService, TurnstileGuard],
  exports: [InboxService],
})
export class InboxModule {}
