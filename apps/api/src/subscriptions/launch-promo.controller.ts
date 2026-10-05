import { Controller, Get } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Promo de lanzamiento del plan Pro que muestra la landing: 15% los primeros
 * 3 meses para los primeros 15 comercios. Arranca con 6 lugares tomados y
 * suma uno por cada comercio que se da de alta desde el lanzamiento.
 */
export const LAUNCH_PROMO = {
  discountPercent: 15,
  months: 3,
  spots: 15,
  baseTaken: 6,
  startsAt: new Date("2026-10-05T03:00:00Z"),
} as const;

const CACHE_MS = 5 * 60_000;

@Controller("public/launch-promo")
export class LaunchPromoController {
  private cache: { at: number; taken: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get()
  async get() {
    const taken = Math.min(LAUNCH_PROMO.spots, await this.taken());
    return {
      discountPercent: LAUNCH_PROMO.discountPercent,
      months: LAUNCH_PROMO.months,
      spots: LAUNCH_PROMO.spots,
      taken,
    };
  }

  private async taken(): Promise<number> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.taken;
    const joined = await this.prisma.tenant.count({
      where: {
        type: "RETAILER",
        active: true,
        managedByPlatform: false,
        createdAt: { gte: LAUNCH_PROMO.startsAt },
      },
    });
    const taken = LAUNCH_PROMO.baseTaken + joined;
    this.cache = { at: Date.now(), taken };
    return taken;
  }
}
