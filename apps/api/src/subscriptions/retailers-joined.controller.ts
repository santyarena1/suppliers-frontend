import { Controller, Get } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Cuántos comercios ya usan NODO, para la landing. Arranca en una base fija
 * y suma uno por cada comercio que se da de alta desde el lanzamiento.
 */
export const RETAILERS_JOINED = {
  base: 6,
  since: new Date("2026-10-05T03:00:00Z"),
} as const;

const CACHE_MS = 5 * 60_000;

@Controller("public/retailers-joined")
export class RetailersJoinedController {
  private cache: { at: number; count: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get()
  async get() {
    return { count: await this.count() };
  }

  private async count(): Promise<number> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.count;
    const joined = await this.prisma.tenant.count({
      where: {
        type: "RETAILER",
        active: true,
        managedByPlatform: false,
        createdAt: { gte: RETAILERS_JOINED.since },
      },
    });
    const count = RETAILERS_JOINED.base + joined;
    this.cache = { at: Date.now(), count };
    return count;
  }
}
