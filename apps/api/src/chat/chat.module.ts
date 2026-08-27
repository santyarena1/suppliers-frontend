import { Module, forwardRef } from "@nestjs/common";
import { AssetsModule } from "../assets/assets.module";
import { TenantsModule } from "../tenants/tenants.module";
import { ChatController } from "./chat.controller";
import { ChatHub } from "./chat.hub";
import { ChatService } from "./chat.service";

@Module({
  imports: [forwardRef(() => TenantsModule), AssetsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatHub],
  exports: [ChatService, ChatHub],
})
export class ChatModule {}
