import { BadRequestException, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { RetailIngestService } from "./retail-ingest.service";
import { RetailSearchService } from "./retail-search.service";
import { PrismaService } from "../prisma/prisma.service";

@Controller()
export class RetailController {
  constructor(
    private readonly search: RetailSearchService,
    private readonly ingest: RetailIngestService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Búsqueda amplia sobre precios de venta de locales (DB propia).
   * Query libre — tokens flexibles, no exige coincidencia exacta de título.
   */
  @Get("retail/search")
  searchRetail(@Query("q") q = "", @Query("take") take?: string) {
    if (!q.trim()) throw new BadRequestException("Falta el parámetro q");
    return this.search.search(q.trim(), take ? Number(take) : 60);
  }

  @Get("retail/products/:id")
  getProduct(@Param("id") id: string) {
    return this.search.getById(id);
  }

  @UseGuards(RolesGuard)
  @Roles("ROLE_ADMIN")
  @Post("admin/retail/ingest")
  triggerIngest() {
    // Fire-and-forget: el job puede tardar mucho; devolvemos estado inmediato.
    if (this.ingest.isRunning()) {
      return { started: false, reason: "already_running" };
    }
    void this.ingest.runFullIngest();
    return { started: true };
  }

  @UseGuards(RolesGuard)
  @Roles("ROLE_ADMIN")
  @Get("admin/retail/ingest/status")
  async ingestStatus() {
    const last = await this.prisma.retailIngestRun.findFirst({ orderBy: { startedAt: "desc" } });
    const counts = await Promise.all([
      this.prisma.retailStore.count({ where: { active: true } }),
      this.prisma.retailProduct.count({ where: { active: true } }),
    ]);
    return {
      running: this.ingest.isRunning(),
      stores: counts[0],
      products: counts[1],
      lastRun: last,
    };
  }
}
