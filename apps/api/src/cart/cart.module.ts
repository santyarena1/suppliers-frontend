import { Module } from "@nestjs/common";
import { TenantsModule } from "../tenants/tenants.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";

@Module({
  imports: [TenantsModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
