import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantsModule } from "../tenants/tenants.module";
import { AdminOnboardingController, OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [OnboardingController, AdminOnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
