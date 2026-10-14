import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma, type Storefront, type StorefrontOrderStatus } from "@prisma/client";
import { makeListProviderKey, type Provider } from "@nodo/shared";
import { randomUUID } from "node:crypto";
import { shouldRunScheduledJob } from "../common/cron-window";
import { domainEvents } from "../common/events/domain-events";
import { PrismaService } from "../prisma/prisma.service";
import { ProvidersService } from "../providers/providers.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { assertPermission } from "../tenants/tenant-roles";
import type { AddStorefrontProductDto, UpdateStorefrontDto, UpdateStorefrontProductDto } from "./dto/storefront.dto";
import {
  finalFromNet,
  isStockFresh,
  linesOverStock,
  shouldWarnStale,
  stockAfterOrder,
  stockExpiresAt,
  storefrontHiddenReason,
  storefrontSupplierName,
  type StockLine,
} from "./storefront-rules";

const PRODUCT_LIMIT = 5000;
const MANUAL_PREFIX = "M-";

type StorefrontWithTenants = Storefront & {
  retailerTenant: { id: string; name: string; active: boolean; contactPhone: string | null; contactEmail: string | null };
  supplierTenant: { id: string; providerKey: string | null };
};

const STOREFRONT_INCLUDE = {
  retailerTenant: { select: { id: true, name: true, active: true, contactPhone: true, contactEmail: true } },
  supplierTenant: { select: { id: true, providerKey: true } },
} as const;

/**
 * Vender en NODO: la tienda de un comercio para los demás comercios
 * (docs/PLAN_VENDER_EN_NODO.md). Es un proveedor por lista que le pertenece al
 * comercio; la visibilidad, la búsqueda y el carrito son los de cualquier lista.
 */
@Injectable()
export class StorefrontService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorefrontService.name);
  private readonly unsubscribes: (() => void)[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService
  ) {}

  onModuleInit() {
    this.unsubscribes.push(
      domainEvents.on("list.applied", ({ provider, level }) => {
        if (level !== "BASE") return;
        void this.onListApplied(provider).catch((err) => this.logger.warn(`Lista aplicada en ${provider}: ${msg(err)}`));
      }),
      domainEvents.on("storefront.order", ({ orderId }) => {
        void this.notifyNewOrder(orderId).catch((err) => this.logger.warn(`Aviso de pedido ${orderId}: ${msg(err)}`));
      })
    );
  }

  onModuleDestroy() {
    for (const off of this.unsubscribes) off();
  }

  // ---------- Dueño de la tienda ----------

  private assertOwnerSide(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") throw new ForbiddenException("Vender en NODO es para comercios");
    assertPermission(tenant, "providers.manage");
  }

  private async findOwn(tenant: TenantContext): Promise<StorefrontWithTenants | null> {
    return this.prisma.storefront.findUnique({ where: { retailerTenantId: tenant.tenantId }, include: STOREFRONT_INCLUDE });
  }

  private async requireOwn(tenant: TenantContext): Promise<StorefrontWithTenants & { providerKey: Provider }> {
    this.assertOwnerSide(tenant);
    const sf = await this.findOwn(tenant);
    if (!sf || !sf.supplierTenant.providerKey) throw new NotFoundException("Todavía no abriste tu tienda");
    return { ...sf, providerKey: sf.supplierTenant.providerKey as Provider };
  }

  async getMine(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") return { exists: false as const };
    const sf = await this.findOwn(tenant);
    if (!sf) return { exists: false as const };
    return this.view(sf);
  }

  private async view(sf: StorefrontWithTenants) {
    const key = sf.supplierTenant.providerKey ?? "";
    const now = new Date();
    const [productCount, inStock, pendingOrders, buyers] = await Promise.all([
      this.prisma.supplierBaseOffer.count({ where: { provider: key } }),
      this.prisma.supplierBaseOffer.count({ where: { provider: key, OR: [{ stock: null }, { stock: { gt: 0 } }] } }),
      this.prisma.providerOrder.count({ where: { ...this.visibleOrderWhere(key), storefrontStatus: "PENDING" } }),
      this.prisma.tenantLink.count({ where: { supplierTenantId: sf.supplierTenantId, status: "LIST_CONNECTED" } }),
    ]);
    const hiddenReason = storefrontHiddenReason({ ...sf, ownerActive: sf.retailerTenant.active }, now);
    return {
      exists: true as const,
      id: sf.id,
      name: sf.retailerTenant.name,
      provider: key,
      status: sf.status,
      suspendedReason: sf.status === "SUSPENDED" ? sf.suspendedReason : null,
      stockConfirmedAt: sf.stockConfirmedAt?.toISOString() ?? null,
      stockExpiresAt: stockExpiresAt(sf)?.toISOString() ?? null,
      stockValidDays: sf.stockValidDays,
      hiddenReason: hiddenReason ?? (productCount === 0 ? ("NO_PRODUCTS" as const) : null),
      visible: hiddenReason == null && inStock > 0,
      contactPhone: sf.contactPhone,
      contactNote: sf.contactNote,
      productCount,
      inStockCount: inStock,
      pendingOrders,
      reach: buyers,
      createdAt: sf.createdAt.toISOString(),
    };
  }

  /** Abre la tienda (o la reactiva si estaba pausada). Idempotente. */
  async open(tenant: TenantContext, dto: { contactPhone?: string | null; contactNote?: string | null }) {
    this.assertOwnerSide(tenant);
    const existing = await this.findOwn(tenant);
    if (existing) {
      if (existing.status === "SUSPENDED") throw new ForbiddenException("NODO frenó tu tienda. Escribinos para revisarlo.");
      if (existing.status === "PAUSED") {
        await this.prisma.storefront.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
      }
      return this.view((await this.findOwn(tenant))!);
    }
    const retailer = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenant.tenantId },
      select: { id: true, name: true, contactPhone: true },
    });
    let created: StorefrontWithTenants | null = null;
    for (let attempt = 1; attempt <= 20 && !created; attempt++) {
      const name = storefrontSupplierName(retailer.name, attempt);
      const providerKey = await this.freeProviderKey(name);
      try {
        created = await this.prisma.$transaction(async (tx) => {
          const supplier = await tx.tenant.create({
            data: { name, type: "DISTRIBUTOR", providerKey, managedByPlatform: true, notes: "Tienda de un comercio (Vender en NODO)" },
            select: { id: true },
          });
          return tx.storefront.create({
            data: {
              retailerTenantId: retailer.id,
              supplierTenantId: supplier.id,
              contactPhone: clean(dto.contactPhone, 40) ?? retailer.contactPhone,
              contactNote: clean(dto.contactNote, 500),
            },
            include: STOREFRONT_INCLUDE,
          });
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Otra pestaña ya la abrió, o el nombre se tomó en el medio.
        const raced = await this.findOwn(tenant);
        if (raced) return this.view(raced);
      }
    }
    if (!created) throw new ConflictException("No se pudo abrir la tienda. Probá de nuevo.");
    await this.syncLinks(created.id);
    this.logger.log(`Tienda abierta: ${retailer.name} (${created.supplierTenant.providerKey})`);
    return this.view(created);
  }

  async update(tenant: TenantContext, dto: UpdateStorefrontDto) {
    const sf = await this.requireOwn(tenant);
    if (dto.status && sf.status === "SUSPENDED") throw new ForbiddenException("NODO frenó tu tienda. Escribinos para revisarlo.");
    await this.prisma.storefront.update({
      where: { id: sf.id },
      data: {
        ...(dto.contactPhone !== undefined ? { contactPhone: clean(dto.contactPhone, 40) } : {}),
        ...(dto.contactNote !== undefined ? { contactNote: clean(dto.contactNote, 500) } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    return this.view((await this.findOwn(tenant))!);
  }

  async confirmStock(tenant: TenantContext) {
    const sf = await this.requireOwn(tenant);
    await this.prisma.storefront.update({ where: { id: sf.id }, data: { stockConfirmedAt: new Date(), staleWarnedAt: null } });
    return this.view((await this.findOwn(tenant))!);
  }

  // ---------- Productos ----------

  async products(tenant: TenantContext, q?: string) {
    const sf = await this.requireOwn(tenant);
    const rows = await this.prisma.supplierBaseOffer.findMany({ where: { provider: sf.providerKey }, take: PRODUCT_LIMIT });
    const fichas = await this.prisma.providerSyncCache.findMany({
      where: { provider: sf.providerKey, externalId: { in: rows.map((r) => r.externalId) } },
      select: { externalId: true, name: true, brand: true, category: true, sku: true, ean: true, imageUrl: true },
    });
    const byId = new Map(fichas.map((f) => [f.externalId, f]));
    const needle = normalize(q ?? "");
    const items = rows
      .map((r) => {
        const f = byId.get(r.externalId);
        return {
          externalId: r.externalId,
          name: f?.name ?? r.externalId,
          brand: f?.brand ?? null,
          category: f?.category ?? null,
          sku: f?.sku ?? null,
          ean: f?.ean ?? null,
          imageUrl: f?.imageUrl ?? null,
          price: num(r.price),
          finalPrice: num(r.finalPrice),
          currency: r.currency,
          ivaPercent: num(r.ivaPercent),
          stock: r.stock,
          manual: r.externalId.startsWith(MANUAL_PREFIX),
          updatedAt: r.updatedAt.toISOString(),
        };
      })
      .filter((p) => !needle || normalize([p.name, p.brand, p.sku, p.ean, p.category].filter(Boolean).join(" ")).includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    return { items, total: rows.length };
  }

  async addProduct(tenant: TenantContext, dto: AddStorefrontProductDto) {
    const sf = await this.requireOwn(tenant);
    const name = clean(dto.name, 300);
    if (!name) throw new BadRequestException("Poné el nombre del producto");
    const count = await this.prisma.supplierBaseOffer.count({ where: { provider: sf.providerKey } });
    if (count >= PRODUCT_LIMIT) throw new BadRequestException(`Tu tienda llegó al máximo de ${PRODUCT_LIMIT} productos`);
    const externalId = `${MANUAL_PREFIX}${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const iva = dto.ivaPercent ?? 21;
    const ficha = {
      name,
      brand: clean(dto.brand, 120),
      category: clean(dto.category, 120),
      sku: clean(dto.sku, 120),
      ean: clean(dto.ean, 60),
      imageUrl: cleanUrl(dto.imageUrl),
      description: clean(dto.description, 2000),
    };
    await this.prisma.$transaction([
      this.prisma.providerSyncCache.create({
        data: { provider: sf.providerKey, externalId, ...ficha, raw: { source: "storefront-manual" } },
      }),
      this.prisma.supplierBaseOffer.create({
        data: {
          provider: sf.providerKey,
          externalId,
          price: dto.price,
          finalPrice: finalFromNet(dto.price, iva),
          currency: dto.currency,
          ivaPercent: iva,
          stock: dto.stock,
        },
      }),
    ]);
    await this.rematerialize(sf);
    return { externalId };
  }

  async updateProduct(tenant: TenantContext, externalId: string, dto: UpdateStorefrontProductDto) {
    const sf = await this.requireOwn(tenant);
    const row = await this.prisma.supplierBaseOffer.findUnique({
      where: { provider_externalId: { provider: sf.providerKey, externalId } },
    });
    if (!row) throw new NotFoundException("Ese producto no está en tu tienda");
    const price = dto.price ?? num(row.price);
    const iva = dto.ivaPercent ?? num(row.ivaPercent) ?? 21;
    const offerData: Prisma.SupplierBaseOfferUpdateInput = { syncedAt: new Date() };
    if (dto.price !== undefined || dto.ivaPercent !== undefined) {
      offerData.price = price;
      offerData.ivaPercent = iva;
      offerData.finalPrice = price == null ? null : finalFromNet(price, iva);
    }
    if (dto.currency !== undefined) offerData.currency = dto.currency;
    if (dto.stock !== undefined) {
      offerData.stock = dto.stock;
      offerData.stockStatus = null;
    }
    const fichaData: Prisma.ProviderSyncCacheUpdateInput = {};
    if (dto.name !== undefined) {
      const name = clean(dto.name, 300);
      if (!name) throw new BadRequestException("El nombre no puede quedar vacío");
      fichaData.name = name;
    }
    if (dto.brand !== undefined) fichaData.brand = clean(dto.brand, 120);
    if (dto.category !== undefined) fichaData.category = clean(dto.category, 120);
    await this.prisma.$transaction([
      this.prisma.supplierBaseOffer.update({ where: { id: row.id }, data: offerData }),
      ...(Object.keys(fichaData).length
        ? [
            this.prisma.providerSyncCache.update({
              where: { provider_externalId: { provider: sf.providerKey, externalId } },
              data: fichaData,
            }),
          ]
        : []),
    ]);
    await this.rematerialize(sf);
    return { externalId };
  }

  async removeProduct(tenant: TenantContext, externalId: string) {
    const sf = await this.requireOwn(tenant);
    const deleted = await this.prisma.supplierBaseOffer.deleteMany({ where: { provider: sf.providerKey, externalId } });
    if (deleted.count === 0) throw new NotFoundException("Ese producto no está en tu tienda");
    await this.prisma.tenantProductOffer.updateMany({
      where: { provider: sf.providerKey, externalId, source: "BASE_LIST", active: true },
      data: { active: false },
    });
    return { removed: true };
  }

  /** Copia la lista base a la tienda y a cada comercio vinculado (búsqueda, fichas, carrito). */
  private async rematerialize(sf: { supplierTenantId: string; providerKey: Provider }) {
    const links = await this.prisma.tenantLink.findMany({
      where: { supplierTenantId: sf.supplierTenantId, status: { in: ["ACTIVE", "LIST_CONNECTED"] }, clientTenant: { active: true } },
      select: { clientTenantId: true },
    });
    for (const tenantId of [sf.supplierTenantId, ...links.map((l) => l.clientTenantId)]) {
      await this.providers.materializeBaseOffers(tenantId, sf.providerKey);
    }
  }

  // ---------- Vínculos ----------

  /**
   * Una tienda se ve en todos los comercios: crea el vínculo por lista con los que
   * todavía no lo tienen y les materializa el catálogo. No toca vínculos existentes.
   */
  async syncLinks(storefrontId: string): Promise<number> {
    const sf = await this.prisma.storefront.findUnique({ where: { id: storefrontId }, include: STOREFRONT_INCLUDE });
    if (!sf || sf.status !== "ACTIVE" || !sf.supplierTenant.providerKey) return 0;
    const [retailers, existing] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { type: "RETAILER", active: true, id: { not: sf.retailerTenantId } },
        select: { id: true },
      }),
      this.prisma.tenantLink.findMany({ where: { supplierTenantId: sf.supplierTenantId }, select: { clientTenantId: true } }),
    ]);
    const have = new Set(existing.map((l) => l.clientTenantId));
    const missing = retailers.map((r) => r.id).filter((id) => !have.has(id));
    if (missing.length === 0) return 0;
    const provider = sf.supplierTenant.providerKey;
    await this.prisma.$transaction([
      this.prisma.tenantLink.createMany({
        data: missing.map((clientTenantId) => ({ clientTenantId, supplierTenantId: sf.supplierTenantId, status: "LIST_CONNECTED" as const })),
        skipDuplicates: true,
      }),
      // A un local no se le pide lo que no tiene: sin stock no se muestra. Si el
      // comercio ya tenía configuración para esta clave, no se pisa.
      this.prisma.providerSyncConfig.createMany({
        data: missing.map((tenantId) => ({ tenantId, provider, enabled: false, priceChannel: "LIST" as const, zeroStockAction: "HIDE" as const })),
        skipDuplicates: true,
      }),
    ]);
    for (const clientTenantId of missing) {
      await this.providers
        .materializeBaseOffers(clientTenantId, sf.supplierTenant.providerKey as Provider)
        .catch((err) => this.logger.warn(`Materializar tienda ${sf.supplierTenant.providerKey} en ${clientTenantId}: ${msg(err)}`));
    }
    return missing.length;
  }

  /** Comercios nuevos: se suman a las tiendas abiertas. */
  @Cron("*/15 * * * *")
  async syncAllLinks() {
    if (!shouldRunScheduledJob()) return;
    try {
      const active = await this.prisma.storefront.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
      for (const sf of active) await this.syncLinks(sf.id);
    } catch (err) {
      this.logger.warn(`Vínculos de tiendas: ${msg(err)}`);
    }
  }

  /** Avisa al dueño un día antes de que venza el stock confirmado. */
  @Cron("5 * * * *")
  async warnStaleStock() {
    if (!shouldRunScheduledJob()) return;
    try {
      const now = new Date();
      const candidates = await this.prisma.storefront.findMany({
        where: { status: "ACTIVE", stockConfirmedAt: { not: null } },
        include: STOREFRONT_INCLUDE,
      });
      for (const sf of candidates) {
        if (!shouldWarnStale(sf, now)) continue;
        const fresh = isStockFresh(sf, now);
        await this.prisma.$transaction([
          this.prisma.orgNotification.create({
            data: {
              toTenantId: sf.retailerTenantId,
              kind: "SYSTEM",
              title: fresh ? "Confirmá el stock de tu tienda" : "Tu tienda dejó de verse",
              body: fresh
                ? "Mañana vence el stock que confirmaste. Confirmalo en Vender en NODO para que tu tienda siga apareciendo."
                : "Pasaron los días sin confirmar el stock. Confirmalo en Vender en NODO y vuelve a aparecer.",
              landingKey: "storefront:stock",
            },
          }),
          this.prisma.storefront.update({ where: { id: sf.id }, data: { staleWarnedAt: now } }),
        ]);
      }
    } catch (err) {
      this.logger.warn(`Aviso de stock de tiendas: ${msg(err)}`);
    }
  }

  private async onListApplied(provider: string) {
    const sf = await this.prisma.storefront.findFirst({ where: { supplierTenant: { providerKey: provider } }, select: { id: true } });
    if (!sf) return;
    // Subir la planilla completa es confirmar el stock.
    await this.prisma.storefront.update({ where: { id: sf.id }, data: { stockConfirmedAt: new Date(), staleWarnedAt: null } });
    await this.syncLinks(sf.id);
  }

  // ---------- Pedidos (lado tienda) ----------

  /** Pedidos que la tienda ve: los que el comprador ya dejó salir (aprobados o sin aprobación). */
  private visibleOrderWhere(provider: string): Prisma.ProviderOrderWhereInput {
    return { provider, storefrontStatus: { not: null }, approvalStatus: { in: ["APPROVED", "NOT_REQUIRED"] } };
  }

  async orders(tenant: TenantContext, status?: StorefrontOrderStatus) {
    const sf = await this.requireOwn(tenant);
    const rows = await this.prisma.providerOrder.findMany({
      where: { ...this.visibleOrderWhere(sf.providerKey), ...(status ? { storefrontStatus: status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        tenant: { select: { name: true, contactPhone: true, contactEmail: true } },
        createdBy: { select: { username: true, email: true } },
      },
    });
    const ids = [...new Set(rows.flatMap((r) => orderLines(r.items).map((l) => l.externalId)))];
    const stock = await this.stockMap(sf.providerKey, ids);
    return rows.map((r) => ({
      id: r.id,
      status: r.storefrontStatus,
      note: r.storefrontNote,
      respondedAt: r.storefrontRespondedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      buyer: {
        name: r.tenant.name,
        phone: r.tenant.contactPhone,
        email: r.tenant.contactEmail ?? r.createdBy?.email ?? null,
        person: r.createdBy?.username ?? null,
      },
      notes: r.notes,
      total: num(r.total),
      quoteRate: quoteRateOf(r.draftInput),
      items: orderLines(r.items).map((l) => ({ ...l, stockNow: stock.get(l.externalId) ?? null })),
    }));
  }

  async respond(tenant: TenantContext, orderId: string, action: "CONFIRM" | "REJECT", note?: string | null) {
    const sf = await this.requireOwn(tenant);
    const order = await this.prisma.providerOrder.findFirst({
      where: { id: orderId, ...this.visibleOrderWhere(sf.providerKey) },
    });
    if (!order) throw new NotFoundException("Pedido no encontrado");
    if (order.storefrontStatus !== "PENDING") throw new ConflictException("Ese pedido ya fue respondido");
    const next: StorefrontOrderStatus = action === "CONFIRM" ? "CONFIRMED" : "REJECTED";
    const reason = clean(note, 500);
    if (next === "REJECTED" && !reason) throw new BadRequestException("Contale al comprador por qué lo rechazás");
    const lines = orderLines(order.items);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.providerOrder.updateMany({
        where: { id: order.id, storefrontStatus: "PENDING" },
        data: { storefrontStatus: next, storefrontRespondedAt: new Date(), storefrontNote: reason },
      });
      if (claimed.count === 0) throw new ConflictException("Ese pedido ya fue respondido");
      if (next === "CONFIRMED") {
        const current = await this.stockMap(sf.providerKey, lines.map((l) => l.externalId), tx);
        for (const [externalId, stock] of stockAfterOrder(current, lines)) {
          await tx.supplierBaseOffer.update({
            where: { provider_externalId: { provider: sf.providerKey, externalId } },
            data: { stock, stockStatus: null, syncedAt: new Date() },
          });
        }
      }
    });
    if (next === "CONFIRMED") await this.rematerialize(sf);

    await this.prisma.orgNotification.create({
      data: {
        toTenantId: order.tenantId,
        fromTenantId: sf.retailerTenantId,
        kind: "SYSTEM",
        title: next === "CONFIRMED" ? `${sf.retailerTenant.name} confirmó tu pedido` : `${sf.retailerTenant.name} rechazó tu pedido`,
        body:
          next === "CONFIRMED"
            ? `Coordiná la entrega y el pago con ${sf.retailerTenant.name}${sf.contactPhone ? ` (${sf.contactPhone})` : ""}.`
            : `Motivo: ${reason}`,
        landingKey: `storefront-purchase:${order.id}`,
      },
    });
    return { id: order.id, status: next };
  }

  private async stockMap(
    provider: string,
    externalIds: string[],
    client: Pick<PrismaService, "supplierBaseOffer"> | Prisma.TransactionClient = this.prisma
  ): Promise<Map<string, number | null>> {
    if (externalIds.length === 0) return new Map();
    const rows = await client.supplierBaseOffer.findMany({
      where: { provider, externalId: { in: externalIds } },
      select: { externalId: true, stock: true },
    });
    return new Map(rows.map((r) => [r.externalId, r.stock]));
  }

  private async notifyNewOrder(orderId: string) {
    const order = await this.prisma.providerOrder.findUnique({
      where: { id: orderId },
      include: { tenant: { select: { name: true } } },
    });
    if (!order || order.storefrontStatus !== "PENDING") return;
    if (order.approvalStatus !== "APPROVED" && order.approvalStatus !== "NOT_REQUIRED") return;
    const sf = await this.prisma.storefront.findFirst({ where: { supplierTenant: { providerKey: order.provider } } });
    if (!sf) return;
    const lines = orderLines(order.items);
    await this.prisma.orgNotification.create({
      data: {
        toTenantId: sf.retailerTenantId,
        fromTenantId: order.tenantId,
        kind: "SYSTEM",
        title: `Nuevo pedido de ${order.tenant.name}`,
        body: `${lines.length} ${lines.length === 1 ? "producto" : "productos"}. Confirmalo o rechazalo en Vender en NODO.`,
        landingKey: `storefront-order:${order.id}`,
      },
    });
  }

  // ---------- Pedidos (lado comprador) ----------

  /**
   * Antes de crear el pedido: que la tienda tenga esos productos y no se pida más
   * de lo publicado. Devuelve `true` si el proveedor es una tienda.
   */
  async validatePurchase(buyerTenantId: string, provider: string, lines: (StockLine & { name?: string })[]): Promise<boolean> {
    const sf = await this.prisma.storefront.findFirst({
      where: { supplierTenant: { providerKey: provider } },
      select: { retailerTenantId: true },
    });
    if (!sf) return false;
    if (sf.retailerTenantId === buyerTenantId) throw new BadRequestException("No podés hacerle un pedido a tu propia tienda");
    const ids = [...new Set(lines.map((l) => l.externalId))];
    const stock = await this.stockMap(provider, ids);
    const gone = ids.filter((id) => !stock.has(id));
    if (gone.length) throw new BadRequestException("Algún producto ya no está publicado en esa tienda. Actualizá el carrito.");
    const over = linesOverStock(stock, lines);
    if (over.length) {
      const first = over[0];
      throw new BadRequestException(
        `${first.name}: pediste ${first.asked} y la tienda tiene ${first.available}.${over.length > 1 ? ` (y ${over.length - 1} más)` : ""}`
      );
    }
    return true;
  }

  async cancelPurchase(tenant: TenantContext, orderId: string) {
    const order = await this.prisma.providerOrder.findFirst({ where: { id: orderId, tenantId: tenant.tenantId } });
    if (!order || !order.storefrontStatus) throw new NotFoundException("Pedido no encontrado");
    const done = await this.prisma.providerOrder.updateMany({
      where: { id: order.id, storefrontStatus: "PENDING" },
      data: { storefrontStatus: "CANCELLED", storefrontRespondedAt: new Date() },
    });
    if (done.count === 0) throw new ConflictException("La tienda ya respondió ese pedido");
    const sf = await this.prisma.storefront.findFirst({ where: { supplierTenant: { providerKey: order.provider } } });
    const sellerSaw = order.approvalStatus === "APPROVED" || order.approvalStatus === "NOT_REQUIRED";
    if (sf && sellerSaw) {
      await this.prisma.orgNotification.create({
        data: {
          toTenantId: sf.retailerTenantId,
          fromTenantId: order.tenantId,
          kind: "SYSTEM",
          title: `${tenant.tenantName} canceló su pedido`,
          body: "Lo canceló antes de que respondieras. No hace falta hacer nada.",
          landingKey: `storefront-order:${order.id}`,
        },
      });
    }
    return { id: order.id, status: "CANCELLED" as const };
  }

  // ---------- Administración ----------

  async adminList() {
    const rows = await this.prisma.storefront.findMany({ include: STOREFRONT_INCLUDE, orderBy: { createdAt: "desc" } });
    const now = new Date();
    return Promise.all(
      rows.map(async (sf) => {
        const key = sf.supplierTenant.providerKey ?? "";
        const [products, orders, pending] = await Promise.all([
          this.prisma.supplierBaseOffer.count({ where: { provider: key } }),
          this.prisma.providerOrder.count({ where: this.visibleOrderWhere(key) }),
          this.prisma.providerOrder.count({ where: { ...this.visibleOrderWhere(key), storefrontStatus: "PENDING" } }),
        ]);
        return {
          id: sf.id,
          retailerTenantId: sf.retailerTenantId,
          name: sf.retailerTenant.name,
          provider: key,
          status: sf.status,
          suspendedReason: sf.suspendedReason,
          hiddenReason: storefrontHiddenReason({ ...sf, ownerActive: sf.retailerTenant.active }, now),
          stockConfirmedAt: sf.stockConfirmedAt?.toISOString() ?? null,
          contactPhone: sf.contactPhone,
          products,
          orders,
          pendingOrders: pending,
          createdAt: sf.createdAt.toISOString(),
        };
      })
    );
  }

  async adminSetStatus(id: string, status: "ACTIVE" | "SUSPENDED", reason?: string | null) {
    const sf = await this.prisma.storefront.findUnique({ where: { id } });
    if (!sf) throw new NotFoundException("Tienda no encontrada");
    if (status === "SUSPENDED" && !clean(reason, 500)) throw new BadRequestException("Indicá el motivo");
    await this.prisma.storefront.update({
      where: { id },
      data: { status, suspendedReason: status === "SUSPENDED" ? clean(reason, 500) : null },
    });
    await this.prisma.orgNotification.create({
      data: {
        toTenantId: sf.retailerTenantId,
        kind: "SYSTEM",
        title: status === "SUSPENDED" ? "NODO frenó tu tienda" : "Tu tienda volvió a estar activa",
        body: status === "SUSPENDED" ? `Motivo: ${clean(reason, 500)}` : "Ya la ven de nuevo los demás comercios.",
        landingKey: "storefront:status",
      },
    });
    if (status === "ACTIVE") await this.syncLinks(id);
    return { id, status };
  }

  // ---------- Helpers ----------

  private async freeProviderKey(name: string): Promise<string> {
    const base = makeListProviderKey(name);
    if (!base) throw new BadRequestException("El nombre del comercio no sirve para generar la tienda");
    const taken = await this.prisma.tenant.findMany({ where: { providerKey: { startsWith: base } }, select: { providerKey: true } });
    const used = new Set(taken.map((t) => t.providerKey));
    if (!used.has(base)) return base;
    for (let n = 2; n < 1000; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
    throw new ConflictException("No se pudo generar una clave para la tienda");
  }
}

/** Líneas de un pedido offline (externalId, nombre, cantidad, precio que vio el comprador). */
export function orderLines(items: Prisma.JsonValue): (StockLine & { name: string; sku: string | null; unitPrice: number | null })[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const o = raw as Record<string, unknown>;
    const externalId = typeof o.externalId === "string" ? o.externalId : "";
    const qty = Number(o.qty);
    if (!externalId || !(qty > 0)) return [];
    const unit = Number(o.unitPrice);
    return [
      {
        externalId,
        qty: Math.round(qty),
        name: typeof o.name === "string" ? o.name : externalId,
        sku: typeof o.sku === "string" ? o.sku : null,
        unitPrice: Number.isFinite(unit) ? unit : null,
      },
    ];
  });
}

function quoteRateOf(draft: Prisma.JsonValue | null): number | null {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  const rate = (draft as Record<string, unknown>).quoteRate;
  return typeof rate === "number" ? rate : null;
}

function num(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clean(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const v = String(value).trim().slice(0, max);
  return v || null;
}

function cleanUrl(value: string | null | undefined): string | null {
  const v = clean(value, 1000);
  if (!v) return null;
  return /^https:\/\//i.test(v) ? v : null;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
