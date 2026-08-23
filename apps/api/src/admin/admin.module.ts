import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { AdminController, PlatformController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [AdminController, PlatformController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
