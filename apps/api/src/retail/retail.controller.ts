import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guards/roles.guard";
import { RetailIngestService } from "./retail-ingest.service";
import { RetailSearchService } from "./retail-search.service";
import { PrismaService } from "../prisma/prisma.service";
import { coerceStoredRetailPrice } from "./retail-price.util";

@Controller()
export class RetailController {
  constructor(
    private readonly search: RetailSearchService,
    private readonly ingest: RetailIngestService,
    private readonly prisma: PrismaService
  ) {}

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
    return this.ingest.requestFullIngest();
  }

  @UseGuards(RolesGuard)
  @Roles("ROLE_ADMIN")
  @Post("admin/retail/stores/:id/ingest")
  async triggerStoreIngest(@Param("id") id: string) {
    try {
      const result = await this.ingest.runStoreIngest(id);
      return { started: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("en curso")) {
        return { started: false, reason: "already_running" };
      }
      throw new BadRequestException(message);
    }
  }

  @UseGuards(RolesGuard)
  @Roles("ROLE_ADMIN")
  @Get("admin/retail/ingest/status")
  async ingestStatus() {
    // Recupera corridas RUNNING huérfanas (sin heartbeat > 15 min)
    const staleBefore = new Date(Date.now() - 15 * 60_000);
    await this.prisma.retailIngestRun.updateMany({
      where: {
        status: "RUNNING",
        heartbeatAt: { lt: staleBefore },
      },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        errorMessage: "Sin progreso (timeout / proceso reiniciado)",
      },
    });

    const last = await this.prisma.retailIngestRun.findFirst({ orderBy: { startedAt: "desc" } });
    const [stores, products] = await Promise.all([
      this.prisma.retailStore.count({ where: { active: true } }),
      this.prisma.retailProduct.count({ where: { active: true } }),
    ]);

    return {
      running: this.ingest.isRunning(),
      mode: this.ingest.getCurrentMode(),
      stores,
      products,
      lastRun: last
        ? {
            id: last.id,
            status: last.status,
            mode: last.mode,
            startedAt: last.startedAt,
            finishedAt: last.finishedAt,
            storesTotal: last.storesTotal,
            storesDone: last.storesDone,
            productsUpserted: last.productsUpserted,
            currentStoreName: last.currentStoreName,
            heartbeatAt: last.heartbeatAt,
            errorMessage: last.errorMessage,
          }
        : null,
    };
  }

  @UseGuards(RolesGuard)
  @Roles("ROLE_ADMIN")
  @Get("admin/retail/stores")
  async listStores() {
    const stores = await this.prisma.retailStore.findMany({
      where: { active: true },
      orderBy: [{ syncedAt: "asc" }, { name: "asc" }],
      select: {
        id: true,
        externalId: true,
        name: true,
        logoUrl: true,
        priceDivisor: true,
        syncedAt: true,
        updatedAt: true,
        _count: { select: { products: { where: { active: true } } } },
      },
    });

    return stores.map((s) => ({
      id: s.id,
      externalId: s.externalId,
      name: s.name,
      logoUrl: s.logoUrl,
      priceDivisor: s.priceDivisor,
      syncedAt: s.syncedAt,
      updatedAt: s.updatedAt,
      productCount: s._count.products,
      neverSynced: s.syncedAt.getTime() <= 0,
    }));
  }

  @UseGuards(RolesGuard)
  @Roles("ROLE_ADMIN")
  @Get("admin/retail/stores/:id/products")
  async listStoreProducts(
    @Param("id") id: string,
    @Query("q") q = "",
    @Query("page") pageStr?: string,
    @Query("take") takeStr?: string
  ) {
    const store = await this.prisma.retailStore.findUnique({ where: { id } });
    if (!store) throw new NotFoundException("Local no encontrado");

    const page = Math.max(1, Number(pageStr) || 1);
    const take = Math.min(100, Math.max(1, Number(takeStr) || 40));
    const skip = (page - 1) * take;
    const query = q.trim();

    const where = {
      storeId: id,
      active: true,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { searchText: { contains: query.toLowerCase() } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.retailProduct.count({ where }),
      this.prisma.retailProduct.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take,
        select: {
          id: true,
          externalId: true,
          name: true,
          price: true,
          categoryName: true,
          imageUrl: true,
          productUrl: true,
          syncedAt: true,
        },
      }),
    ]);

    return {
      store: {
        id: store.id,
        name: store.name,
        logoUrl: store.logoUrl,
        priceDivisor: store.priceDivisor,
        syncedAt: store.syncedAt,
      },
      page,
      take,
      total,
      products: rows.map((r) => ({
        id: r.id,
        externalId: r.externalId,
        name: r.name,
        price: coerceStoredRetailPrice(Number(r.price), store.priceDivisor ?? 1),
        categoryName: r.categoryName,
        imageUrl: r.imageUrl,
        productUrl: r.productUrl,
        syncedAt: r.syncedAt,
      })),
    };
  }
}
