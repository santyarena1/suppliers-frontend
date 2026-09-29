import { Controller, Get, Param } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { BrandItemsService } from "./brand-items.service";
import { BrandLandingService } from "./brand-landing.service";

@Controller("public/brands")
export class PublicBrandsController {
  constructor(
    private readonly landing: BrandLandingService,
    private readonly items: BrandItemsService
  ) {}

  /** Semáforo del link público: solo rangos, nunca unidades. */
  @Public()
  @Get(":publicKey/availability")
  availability(@Param("publicKey") publicKey: string) {
    return this.items.publicView(publicKey);
  }

  @Public()
  @Get(":publicKey")
  get(@Param("publicKey") publicKey: string) {
    return this.landing.getPublic(publicKey);
  }
}
