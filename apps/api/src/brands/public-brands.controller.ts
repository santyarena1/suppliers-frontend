import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { BrandLandingService } from "./brand-landing.service";

@Controller("public/brands")
export class PublicBrandsController {
  constructor(private readonly landing: BrandLandingService) {}

  @Public()
  @Get(":publicKey")
  get(@Param("publicKey") publicKey: string) {
    return this.landing.getPublic(publicKey);
  }
}
