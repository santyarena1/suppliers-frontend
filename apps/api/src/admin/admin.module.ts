import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { AdminController, PlatformController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [UsersModule],
  controllers: [AdminController, PlatformController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
