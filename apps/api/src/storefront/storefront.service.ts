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
import { KNOWN_PROVIDERS, makeListProviderKey, providerLabel, type Provider } from "@nodo/shared";
import { randomBytes, randomUUID } from "node:crypto";
import { shouldRunScheduledJob } from "../common/cron-window";
import { domainEvents } from "../common/events/domain-events";
import { escapeHtml, MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProvidersService } from "../providers/providers.service";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { assertPermission } from "../tenants/tenant-roles";
import type {
  AddStorefrontProductDto,
  CloseStorefrontDto,
  UpdateStorefrontDto,
  UpdateStorefrontProductDto,
} from "./dto/storefront.dto";
import { StorefrontAudienceService } from "./storefront-audience.service";
import { StorefrontImagesService } from "./storefront-images.service";
import { StorefrontSheetService } from "./storefront-sheet.service";
import {
  assetIdOf,
  cleanDisplayName,
  DELIVERY_OPTIONS,
  displayNameProblem,
  finalFromNet,
  INVOICE_TYPES,
  isStockFresh,
  linesOverStock,
  nameKey,
  normalizeImageRefs,
  PAYMENT_METHODS,
  pickAllowed,
  PRODUCT_CONDITIONS,
  sheetExtras,
  shouldWarnStale,
  stockAfterOrder,
  stockExpiresAt,
  stockState,
  storefrontHiddenReason,
  storefrontPublicName,
  storefrontSupplierName,
  type StockLine,
} from "./storefront-rules";

const PRODUCT_LIMIT = 5000;
const MANUAL_PREFIX = "M-";
const WEB_URL = (process.env.PUBLIC_WEB_URL || process.env.WEB_URL || "https://nodohub.app").trim().replace(/\/+$/, "");

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
 * Quién la ve lo decide `StorefrontAudienceService`.
 */
@Injectable()
export class StorefrontService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorefrontService.name);
  private readonly unsubscribes: (() => void)[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
    private readonly audience: StorefrontAudienceService,
    private readonly images: StorefrontImagesService,
    private readonly sheets: StorefrontSheetService,
    private readonly mail: MailService
  ) {}

  onModuleInit() {
    this.unsubscribes.push(
      domainEvents.on("list.applied", ({ provider, level, rows }) => {
        if (level !== "BASE") return;
        void this.onListApplied(provider, rows ?? []).catch((err) => this.logger.warn(`Lista aplicada en ${provider}: ${msg(err)}`));
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
    const [productCount, inStock, pendingOrders, audience] = await Promise.all([
      this.prisma.supplierBaseOffer.count({ where: { provider: key } }),
      this.prisma.supplierBaseOffer.count({ where: { provider: key, OR: [{ stock: null }, { stock: { gt: 0 } }] } }),
      this.prisma.providerOrder.count({ where: { ...this.visibleOrderWhere(key), storefrontStatus: "PENDING" } }),
      this.prisma.storefrontAudience.groupBy({ by: ["status"], where: { storefrontId: sf.id }, _count: { _all: true } }),
    ]);
    const counted = (s: string) => audience.find((a) => a.status === s)?._count._all ?? 0;
    const hiddenReason = storefrontHiddenReason({ ...sf, ownerActive: sf.retailerTenant.active }, now);
    return {
      exists: true as const,
      id: sf.id,
      /** Nombre con el que la ven los demás. */
      name: storefrontPublicName(sf, sf.retailerTenant.name),
      orgName: sf.retailerTenant.name,
      displayName: sf.displayName,
      provider: key,
      status: sf.status,
      suspendedReason: sf.status === "SUSPENDED" ? sf.suspendedReason : null,
      closedAt: sf.closedAt?.toISOString() ?? null,
      stockConfirmedAt: sf.stockConfirmedAt?.toISOString() ?? null,
      stockExpiresAt: stockExpiresAt(sf)?.toISOString() ?? null,
      stockValidDays: sf.stockValidDays,
      staleAction: sf.staleAction === "HIDE" ? ("HIDE" as const) : ("KEEP" as const),
      stockState: stockState(sf, now),
      hiddenReason: hiddenReason ?? (productCount === 0 ? ("NO_PRODUCTS" as const) : null),
      visible: hiddenReason == null && inStock > 0,
      visibility: sf.visibility,
      inviteToken: sf.inviteToken,
      contactPhone: sf.contactPhone,
      contactNote: sf.contactNote,
      ordersEmail: sf.ordersEmail,
      about: sf.about,
      logoUrl: sf.logoUrl,
      paymentMethods: sf.paymentMethods,
      deliveryOptions: sf.deliveryOptions,
      invoiceTypes: sf.invoiceTypes,
      defaultWarranty: sf.defaultWarranty,
      salesTerms: sf.salesTerms,
      sellsOffline: sf.sellsOffline,
      sheet: StorefrontSheetService.view(sf),
      productCount,
      inStockCount: inStock,
      pendingOrders,
      reach: counted("ACCEPTED"),
      audience: { accepted: counted("ACCEPTED"), pending: counted("PENDING"), declined: counted("DECLINED") },
      createdAt: sf.createdAt.toISOString(),
    };
  }

  /** Abre la tienda, o la reactiva si estaba pausada o cerrada. Idempotente. */
  async open(tenant: TenantContext, dto: { contactPhone?: string | null; contactNote?: string | null; ordersEmail?: string | null }) {
    this.assertOwnerSide(tenant);
    const existing = await this.findOwn(tenant);
    if (existing) {
      if (existing.status === "SUSPENDED") throw new ForbiddenException("NODO frenó tu tienda. Escribinos para revisarlo.");
      if (existing.status === "PAUSED" || existing.status === "CLOSED") {
        await this.prisma.storefront.update({ where: { id: existing.id }, data: { status: "ACTIVE", closedAt: null } });
        await this.audience.sync(existing.id);
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
              ordersEmail: cleanEmail(dto.ordersEmail),
              inviteToken: newInviteToken(),
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
    this.logger.log(`Tienda abierta: ${retailer.name} (${created.supplierTenant.providerKey})`);
    return this.view(created);
  }

  async update(tenant: TenantContext, dto: UpdateStorefrontDto) {
    const sf = await this.requireOwn(tenant);
    if (dto.status && sf.status === "SUSPENDED") throw new ForbiddenException("NODO frenó tu tienda. Escribinos para revisarlo.");
    if (dto.status && sf.status === "CLOSED") throw new ConflictException("Tu tienda está cerrada: volvé a abrirla.");
    const data: Prisma.StorefrontUpdateInput = {};
    if (dto.contactPhone !== undefined) data.contactPhone = clean(dto.contactPhone, 40);
    if (dto.contactNote !== undefined) data.contactNote = clean(dto.contactNote, 500);
    if (dto.ordersEmail !== undefined) data.ordersEmail = cleanEmail(dto.ordersEmail);
    if (dto.status) data.status = dto.status;
    if (dto.displayName !== undefined) data.displayName = await this.checkDisplayName(sf, dto.displayName);
    if (dto.about !== undefined) data.about = clean(dto.about, 1500);
    if (dto.logoUrl !== undefined) data.logoUrl = await this.checkLogo(sf, dto.logoUrl);
    if (dto.paymentMethods !== undefined) data.paymentMethods = pickAllowed(dto.paymentMethods, PAYMENT_METHODS);
    if (dto.deliveryOptions !== undefined) data.deliveryOptions = pickAllowed(dto.deliveryOptions, DELIVERY_OPTIONS);
    if (dto.invoiceTypes !== undefined) data.invoiceTypes = pickAllowed(dto.invoiceTypes, INVOICE_TYPES);
    if (dto.defaultWarranty !== undefined) data.defaultWarranty = clean(dto.defaultWarranty, 300);
    if (dto.salesTerms !== undefined) data.salesTerms = clean(dto.salesTerms, 3000);
    if (dto.sellsOffline !== undefined) data.sellsOffline = dto.sellsOffline;
    if (dto.stockValidDays !== undefined) {
      data.stockValidDays = dto.stockValidDays;
      // Cambiar la vigencia arranca la cuenta de nuevo desde la última confirmación.
      data.staleWarnedAt = null;
    }
    if (dto.staleAction !== undefined) data.staleAction = dto.staleAction;
    if (dto.visibility !== undefined) {
      data.visibility = dto.visibility;
      if (dto.visibility === "PRIVATE" && !sf.inviteToken) data.inviteToken = newInviteToken();
    }
    try {
      await this.prisma.storefront.update({ where: { id: sf.id }, data });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException("No se pudo guardar. Probá de nuevo.");
      throw err;
    }
    if (dto.logoUrl !== undefined) await this.syncLogo(sf.providerKey, (data.logoUrl as string | null) ?? null, sf.id);
    if (dto.visibility === "PRIVATE" && sf.visibility !== "PRIVATE") await this.audience.withdrawPendingOffers(sf.id);
    await this.audience.sync(sf.id);
    return this.view((await this.findOwn(tenant))!);
  }

  private async checkDisplayName(sf: StorefrontWithTenants, value: string | null): Promise<string | null> {
    const name = cleanDisplayName(value);
    if (!name || name === sf.retailerTenant.name) return null;
    const [tenants, stores] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { id: { notIn: [sf.retailerTenantId, sf.supplierTenantId] } },
        select: { name: true },
      }),
      this.prisma.storefront.findMany({ where: { id: { not: sf.id }, displayName: { not: null } }, select: { displayName: true } }),
    ]);
    const taken = new Set<string>([
      ...tenants.map((t) => nameKey(t.name.replace(/\s*\(local(?: \d+)?\)$/, ""))),
      ...stores.map((s) => nameKey(s.displayName ?? "")),
      ...KNOWN_PROVIDERS.map((p) => nameKey(providerLabel(p))),
    ]);
    taken.delete("");
    const problem = displayNameProblem(name, taken);
    if (problem) throw new BadRequestException(problem);
    return name;
  }

  private async checkLogo(sf: StorefrontWithTenants, value: string | null): Promise<string | null> {
    if (!value) return null;
    const id = assetIdOf(value);
    if (!id) throw new BadRequestException("Subí el logo desde NODO");
    const owned = await this.images.ownedIds(sf.retailerTenantId, [id]);
    if (!owned.has(id)) throw new BadRequestException("Subí el logo desde NODO");
    return `/assets/${id}`;
  }

  /** El logo de la tienda es el logo del proveedor en todo NODO (filtros, fichas, carrito). */
  private async syncLogo(provider: string, logoUrl: string | null, storefrontId: string) {
    await this.prisma.providerDisplayConfig.upsert({
      where: { provider },
      create: { provider, logoUrl },
      update: { logoUrl },
    });
    await this.images.collect(storefrontId);
  }

  async confirmStock(tenant: TenantContext) {
    const sf = await this.requireOwn(tenant);
    await this.prisma.storefront.update({ where: { id: sf.id }, data: { stockConfirmedAt: new Date(), staleWarnedAt: null } });
    await this.audience.sync(sf.id);
    return this.view((await this.findOwn(tenant))!);
  }

  /**
   * Cierra la tienda: deja de verse y los pedidos sin responder se rechazan
   * avisándole al comprador. Se puede reabrir cuando quiera; si pide borrar los
   * productos, vuelve vacía.
   */
  async close(tenant: TenantContext, dto: CloseStorefrontDto) {
    const sf = await this.requireOwn(tenant);
    if (sf.status === "SUSPENDED") throw new ForbiddenException("NODO frenó tu tienda. Escribinos para revisarlo.");
    const pending = await this.prisma.providerOrder.findMany({
      where: { ...this.visibleOrderWhere(sf.providerKey), storefrontStatus: "PENDING" },
      select: { id: true, tenantId: true },
    });
    const note = "La tienda cerró.";
    await this.prisma.$transaction([
      this.prisma.storefront.update({ where: { id: sf.id }, data: { status: "CLOSED", closedAt: new Date() } }),
      this.prisma.providerOrder.updateMany({
        where: { id: { in: pending.map((p) => p.id) }, storefrontStatus: "PENDING" },
        data: { storefrontStatus: "REJECTED", storefrontRespondedAt: new Date(), storefrontNote: note },
      }),
      ...(pending.length
        ? [
            this.prisma.orgNotification.createMany({
              data: pending.map((p) => ({
                toTenantId: p.tenantId,
                fromTenantId: sf.retailerTenantId,
                kind: "SYSTEM" as const,
                title: `${storefrontPublicName(sf, sf.retailerTenant.name)} cerró su tienda`,
                body: "Tu pedido quedó rechazado porque la tienda cerró.",
                landingKey: `storefront-purchase:${p.id}`,
              })),
            }),
          ]
        : []),
    ]);
    if (dto.deleteProducts) await this.deleteAllProducts(sf);
    this.logger.log(`Tienda cerrada: ${sf.retailerTenant.name}${dto.deleteProducts ? " (con productos borrados)" : ""}`);
    return this.view((await this.findOwn(tenant))!);
  }

  private async deleteAllProducts(sf: { id: string; providerKey: Provider }) {
    await this.prisma.$transaction([
      this.prisma.supplierBaseOffer.deleteMany({ where: { provider: sf.providerKey } }),
      this.prisma.tenantProductOffer.updateMany({ where: { provider: sf.providerKey, active: true }, data: { active: false } }),
      this.prisma.storefrontItem.deleteMany({ where: { storefrontId: sf.id } }),
    ]);
    await this.images.collect(sf.id, 0);
  }

  /** Link nuevo: el anterior deja de servir (los que ya entraron siguen viéndola). */
  async regenerateInvite(tenant: TenantContext) {
    const sf = await this.requireOwn(tenant);
    await this.prisma.storefront.update({ where: { id: sf.id }, data: { inviteToken: newInviteToken() } });
    return this.view((await this.findOwn(tenant))!);
  }

  async audienceList(tenant: TenantContext) {
    const sf = await this.requireOwn(tenant);
    return this.audience.audienceOf(sf.id);
  }

  async removeBuyer(tenant: TenantContext, buyerTenantId: string) {
    const sf = await this.requireOwn(tenant);
    return this.audience.removeBuyer({ id: sf.id, supplierTenantId: sf.supplierTenantId, providerKey: sf.providerKey }, buyerTenantId);
  }

  // ---------- Google Sheets ----------

  async linkSheet(tenant: TenantContext, url: string) {
    const sf = await this.requireOwn(tenant);
    const result = await this.sheets.link(sf.id, tenant.userId, url);
    return { ...result, store: await this.view((await this.findOwn(tenant))!) };
  }

  async unlinkSheet(tenant: TenantContext) {
    const sf = await this.requireOwn(tenant);
    await this.sheets.unlink(sf.id);
    return this.view((await this.findOwn(tenant))!);
  }

  async syncSheet(tenant: TenantContext) {
    const sf = await this.requireOwn(tenant);
    const result = await this.sheets.syncNow(sf.id);
    return { ...result, store: await this.view((await this.findOwn(tenant))!) };
  }

  async uploadImage(tenant: TenantContext, file: { filename: string; buffer: Buffer }) {
    const sf = await this.requireOwn(tenant);
    return this.images.upload(sf.retailerTenantId, file);
  }

  /** Buscar fotos en internet (Serper), con tope diario por tienda. */
  async searchImages(tenant: TenantContext, query: string) {
    const sf = await this.requireOwn(tenant);
    return this.images.search(sf.id, query);
  }

  // ---------- Productos ----------

  async products(tenant: TenantContext, q?: string) {
    const sf = await this.requireOwn(tenant);
    const rows = await this.prisma.supplierBaseOffer.findMany({ where: { provider: sf.providerKey }, take: PRODUCT_LIMIT });
    const ids = rows.map((r) => r.externalId);
    const [fichas, items] = await Promise.all([
      this.prisma.providerSyncCache.findMany({
        where: { provider: sf.providerKey, externalId: { in: ids } },
        select: { externalId: true, name: true, brand: true, category: true, sku: true, ean: true, imageUrl: true, description: true, warranty: true },
      }),
      this.prisma.storefrontItem.findMany({
        where: { storefrontId: sf.id, externalId: { in: ids } },
        select: { externalId: true, images: true, condition: true },
      }),
    ]);
    const byId = new Map(fichas.map((f) => [f.externalId, f]));
    const itemById = new Map(items.map((i) => [i.externalId, i]));
    const needle = normalize(q ?? "");
    const list = rows
      .map((r) => {
        const f = byId.get(r.externalId);
        const it = itemById.get(r.externalId);
        const images = it?.images.length ? it.images : f?.imageUrl ? [f.imageUrl] : [];
        return {
          externalId: r.externalId,
          name: f?.name ?? r.externalId,
          brand: f?.brand ?? null,
          category: f?.category ?? null,
          sku: f?.sku ?? null,
          ean: f?.ean ?? null,
          imageUrl: images[0] ?? null,
          images,
          /** La foto no la subió la tienda: la encontró NODO solo («Primera foto»). */
          autoImage: !it?.images.length && Boolean(f?.imageUrl),
          description: f?.description ?? null,
          warranty: f?.warranty ?? null,
          condition: it?.condition ?? null,
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
    return { items: list, total: rows.length };
  }

  /** Fotos validadas: las subidas tienen que ser de esta tienda. */
  /**
   * Fotos de un producto: links https o fotos subidas por esta tienda.
   * `autoImage` es la foto que NODO le buscó solo al producto («Primera foto»):
   * no es de la tienda, pero la puede conservar.
   */
  private async checkImages(sf: { retailerTenantId: string }, value: unknown, autoImage?: string | null): Promise<string[]> {
    const res = normalizeImageRefs(value);
    if ("error" in res) throw new BadRequestException(res.error);
    const owned = await this.images.ownedIds(sf.retailerTenantId, res.assetIds);
    const autoId = autoImage ? assetIdOf(autoImage) : null;
    if (res.assetIds.some((id) => !owned.has(id) && id !== autoId)) {
      throw new BadRequestException("Alguna foto no es de tu tienda. Subila de nuevo.");
    }
    return res.refs;
  }

  private checkCondition(value: string | null | undefined): string | null {
    if (value == null || value === "") return null;
    if (!(PRODUCT_CONDITIONS as readonly string[]).includes(value)) throw new BadRequestException("Estado del producto inválido");
    return value;
  }

  async addProduct(tenant: TenantContext, dto: AddStorefrontProductDto) {
    const sf = await this.requireOwn(tenant);
    const name = clean(dto.name, 300);
    if (!name) throw new BadRequestException("Poné el nombre del producto");
    const count = await this.prisma.supplierBaseOffer.count({ where: { provider: sf.providerKey } });
    if (count >= PRODUCT_LIMIT) throw new BadRequestException(`Tu tienda llegó al máximo de ${PRODUCT_LIMIT} productos`);
    const images = dto.images !== undefined ? await this.checkImages(sf, dto.images) : dto.imageUrl ? await this.checkImages(sf, [dto.imageUrl]) : [];
    const condition = this.checkCondition(dto.condition);
    const externalId = `${MANUAL_PREFIX}${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const iva = dto.ivaPercent ?? 21;
    const ficha = {
      name,
      brand: clean(dto.brand, 120),
      category: clean(dto.category, 120),
      sku: clean(dto.sku, 120),
      ean: clean(dto.ean, 60),
      imageUrl: images[0] ?? null,
      description: clean(dto.description, 4000),
      warranty: clean(dto.warranty, 300),
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
      ...(images.length || condition
        ? [this.prisma.storefrontItem.create({ data: { storefrontId: sf.id, externalId, images, condition } })]
        : []),
      // Publicar por primera vez es confirmar el stock: la tienda arranca al día.
      ...(sf.stockConfirmedAt ? [] : [this.prisma.storefront.update({ where: { id: sf.id }, data: { stockConfirmedAt: new Date() } })]),
    ]);
    await this.rematerialize(sf);
    await this.audience.sync(sf.id);
    return { externalId };
  }

  async updateProduct(tenant: TenantContext, externalId: string, dto: UpdateStorefrontProductDto) {
    const sf = await this.requireOwn(tenant);
    const row = await this.prisma.supplierBaseOffer.findUnique({
      where: { provider_externalId: { provider: sf.providerKey, externalId } },
    });
    if (!row) throw new NotFoundException("Ese producto no está en tu tienda");
    let images: string[] | undefined;
    if (dto.images !== undefined) {
      const ficha = await this.prisma.providerSyncCache.findUnique({
        where: { provider_externalId: { provider: sf.providerKey, externalId } },
        select: { imageUrl: true },
      });
      images = await this.checkImages(sf, dto.images, ficha?.imageUrl);
    }
    const condition = dto.condition !== undefined ? this.checkCondition(dto.condition) : undefined;
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
    if (dto.sku !== undefined) fichaData.sku = clean(dto.sku, 120);
    if (dto.description !== undefined) fichaData.description = clean(dto.description, 4000);
    if (dto.warranty !== undefined) fichaData.warranty = clean(dto.warranty, 300);
    if (images !== undefined) fichaData.imageUrl = images[0] ?? null;
    const itemData = {
      ...(images !== undefined ? { images } : {}),
      ...(condition !== undefined ? { condition } : {}),
    };
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
      ...(Object.keys(itemData).length
        ? [
            this.prisma.storefrontItem.upsert({
              where: { storefrontId_externalId: { storefrontId: sf.id, externalId } },
              create: { storefrontId: sf.id, externalId, images: images ?? [], condition: condition ?? null },
              update: itemData,
            }),
          ]
        : []),
    ]);
    await this.rematerialize(sf);
    if (images !== undefined) await this.images.collect(sf.id);
    await this.audience.sync(sf.id);
    return { externalId };
  }

  async removeProduct(tenant: TenantContext, externalId: string) {
    const sf = await this.requireOwn(tenant);
    const deleted = await this.prisma.supplierBaseOffer.deleteMany({ where: { provider: sf.providerKey, externalId } });
    if (deleted.count === 0) throw new NotFoundException("Ese producto no está en tu tienda");
    await this.prisma.$transaction([
      this.prisma.tenantProductOffer.updateMany({
        where: { provider: sf.providerKey, externalId, source: "BASE_LIST", active: true },
        data: { active: false },
      }),
      this.prisma.storefrontItem.deleteMany({ where: { storefrontId: sf.id, externalId } }),
    ]);
    await this.images.collect(sf.id);
    return { removed: true };
  }

  /** Copia la lista base a la tienda y a cada comercio que la ve (búsqueda, fichas, carrito). */
  private async rematerialize(sf: { supplierTenantId: string; providerKey: Provider }) {
    const links = await this.prisma.tenantLink.findMany({
      where: { supplierTenantId: sf.supplierTenantId, status: { in: ["ACTIVE", "LIST_CONNECTED"] }, clientTenant: { active: true } },
      select: { clientTenantId: true },
    });
    for (const tenantId of [sf.supplierTenantId, ...links.map((l) => l.clientTenantId)]) {
      await this.providers.materializeBaseOffers(tenantId, sf.providerKey);
    }
  }

  // ---------- Vínculos y recordatorios ----------

  /** Comercios nuevos: se les ofrecen las tiendas abiertas. */
  @Cron("*/15 * * * *")
  async syncAllLinks() {
    if (!shouldRunScheduledJob()) return;
    try {
      const active = await this.prisma.storefront.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
      for (const sf of active) await this.audience.sync(sf.id);
    } catch (err) {
      this.logger.warn(`Vínculos de tiendas: ${msg(err)}`);
    }
  }

  /** Le recuerda al dueño confirmar el stock: aviso en NODO y mail. */
  @Cron("5 * * * *")
  async warnStaleStock() {
    if (!shouldRunScheduledJob()) return;
    try {
      const now = new Date();
      const candidates = await this.prisma.storefront.findMany({
        where: { status: "ACTIVE", stockConfirmedAt: { not: null }, stockValidDays: { gt: 0 } },
        include: STOREFRONT_INCLUDE,
      });
      for (const sf of candidates) {
        if (!shouldWarnStale(sf, now)) continue;
        const products = await this.prisma.supplierBaseOffer.count({ where: { provider: sf.supplierTenant.providerKey ?? "" } });
        if (products === 0) continue;
        await this.remindStock(sf, now);
      }
    } catch (err) {
      this.logger.warn(`Aviso de stock de tiendas: ${msg(err)}`);
    }
  }

  private async remindStock(sf: StorefrontWithTenants, now: Date) {
    const fresh = isStockFresh(sf, now);
    const hides = sf.staleAction === "HIDE";
    const title = fresh ? "Confirmá el stock de tu tienda" : hides ? "Tu tienda dejó de verse" : "Tu stock en NODO está sin confirmar";
    const body = fresh
      ? "Se vence el stock que confirmaste. Si vendiste algo por otro lado, actualizalo; si está todo igual, tocá «Mi stock está al día» en Vender en NODO."
      : hides
        ? "Pasaron los días sin confirmar el stock y elegiste que se oculte. Confirmalo en Vender en NODO y vuelve a aparecer."
        : "Los demás comercios ven que tu stock no está confirmado. Actualizalo o confirmalo en Vender en NODO.";
    await this.prisma.$transaction([
      this.prisma.orgNotification.create({
        data: { toTenantId: sf.retailerTenantId, kind: "SYSTEM", title, body, landingKey: "storefront:stock" },
      }),
      this.prisma.storefront.update({ where: { id: sf.id }, data: { staleWarnedAt: now } }),
    ]);
    await this.mailOwners(sf, title, body, "Ir a mi tienda", `${WEB_URL}/vender`).catch((err) =>
      this.logger.warn(`Mail de stock a ${sf.retailerTenant.name}: ${msg(err)}`)
    );
  }

  /** Mail de la tienda: el que eligió para pedidos, o si no, dueño y administradores (o el de contacto). */
  private async mailOwners(sf: StorefrontWithTenants, title: string, body: string, cta: string, href: string) {
    if (!this.mail.configured()) return;
    const to = new Set<string>();
    if (sf.ordersEmail) to.add(sf.ordersEmail.trim().toLowerCase());
    else {
      const members = await this.prisma.tenantMembership.findMany({
        where: { tenantId: sf.retailerTenantId, active: true, role: { in: ["OWNER", "ADMIN"] } },
        select: { user: { select: { email: true } } },
      });
      for (const m of members) if (m.user.email) to.add(m.user.email.trim().toLowerCase());
      if (to.size === 0 && sf.retailerTenant.contactEmail) to.add(sf.retailerTenant.contactEmail.trim().toLowerCase());
    }
    const name = storefrontPublicName(sf, sf.retailerTenant.name);
    const text = `${title}\n\n${body}\n\n${cta}: ${href}`;
    const html = `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#0e1020;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0e1020;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#16182c;border:1px solid #2a2d4a;border-radius:10px;padding:24px;">
<tr><td style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#8b90b3;">NODO · ${escapeHtml(name)}</td></tr>
<tr><td style="padding-top:10px;font-size:19px;font-weight:700;color:#ffffff;">${escapeHtml(title)}</td></tr>
<tr><td style="padding-top:12px;font-size:14px;line-height:1.55;color:#c5c8dc;">${escapeHtml(body)}</td></tr>
<tr><td style="padding-top:20px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#4033fc;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px;">${escapeHtml(cta)}</a></td></tr>
</table></td></tr></table></body></html>`;
    for (const addr of to) await this.mail.send({ to: addr, subject: `NODO · ${title}`, text, html });
  }

  private async onListApplied(provider: string, rows: { externalId: string; raw: Record<string, unknown> }[]) {
    const sf = await this.prisma.storefront.findFirst({ where: { supplierTenant: { providerKey: provider } }, select: { id: true } });
    if (!sf) return;
    await this.applySheetExtras(sf.id, provider, rows);
    // Subir la planilla completa es confirmar el stock.
    await this.prisma.storefront.update({ where: { id: sf.id }, data: { stockConfirmedAt: new Date(), staleWarnedAt: null } });
    await this.audience.sync(sf.id);
  }

  /**
   * Lo que la planilla trae y el importador no mapea: el estado ("Nuevo",
   * "Usado"…) y varias fotos por celda. Celda vacía = queda lo cargado en NODO.
   */
  private async applySheetExtras(storefrontId: string, provider: string, rows: { externalId: string; raw: Record<string, unknown> }[]) {
    let touched = 0;
    for (const row of rows) {
      const extras = sheetExtras(row.raw ?? {});
      if (!extras.condition && !extras.images) continue;
      await this.prisma.storefrontItem.upsert({
        where: { storefrontId_externalId: { storefrontId, externalId: row.externalId } },
        create: { storefrontId, externalId: row.externalId, images: extras.images ?? [], condition: extras.condition ?? null },
        update: { ...(extras.images ? { images: extras.images } : {}), ...(extras.condition ? { condition: extras.condition } : {}) },
      });
      if (extras.images) {
        await this.prisma.providerSyncCache.updateMany({ where: { provider, externalId: row.externalId }, data: { imageUrl: extras.images[0] } });
      }
      touched++;
    }
    if (touched === 0) return;
    // La foto principal pudo cambiar: se vuelve a copiar a cada comercio que la ve.
    const sf = await this.prisma.storefront.findUnique({ where: { id: storefrontId }, select: { supplierTenantId: true } });
    if (sf) await this.rematerialize({ supplierTenantId: sf.supplierTenantId, providerKey: provider as Provider });
    await this.images.collect(storefrontId);
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

    const name = storefrontPublicName(sf, sf.retailerTenant.name);
    await this.prisma.orgNotification.create({
      data: {
        toTenantId: order.tenantId,
        fromTenantId: sf.retailerTenantId,
        kind: "SYSTEM",
        title: next === "CONFIRMED" ? `${name} confirmó tu pedido` : `${name} rechazó tu pedido`,
        body:
          next === "CONFIRMED"
            ? `Coordiná la entrega y el pago con ${name}${sf.contactPhone ? ` (${sf.contactPhone})` : ""}.`
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
    const sf = await this.prisma.storefront.findFirst({ where: { supplierTenant: { providerKey: order.provider } }, include: STOREFRONT_INCLUDE });
    if (!sf) return;
    const lines = orderLines(order.items);
    const title = `Nuevo pedido de ${order.tenant.name}`;
    const body = `${lines.length} ${lines.length === 1 ? "producto" : "productos"}. Confirmalo o rechazalo en Vender en NODO.`;
    await this.prisma.orgNotification.create({
      data: {
        toTenantId: sf.retailerTenantId,
        fromTenantId: order.tenantId,
        kind: "SYSTEM",
        title,
        body,
        landingKey: `storefront-order:${order.id}`,
      },
    });
    await this.mailOwners(sf, title, body, "Ver el pedido", `${WEB_URL}/vender?tab=pedidos`).catch((err) =>
      this.logger.warn(`Mail de pedido a ${sf.retailerTenant.name}: ${msg(err)}`)
    );
  }

  // ---------- Pedidos (lado comprador) ----------

  /**
   * Antes de crear el pedido: que la tienda esté abierta, que el comprador la
   * vea, que tenga esos productos y que no se pida más de lo publicado.
   * Devuelve `true` si el proveedor es una tienda.
   */
  async validatePurchase(buyerTenantId: string, provider: string, lines: (StockLine & { name?: string })[]): Promise<boolean> {
    const sf = await this.prisma.storefront.findFirst({
      where: { supplierTenant: { providerKey: provider } },
      include: STOREFRONT_INCLUDE,
    });
    if (!sf) return false;
    if (sf.retailerTenantId === buyerTenantId) throw new BadRequestException("No podés hacerle un pedido a tu propia tienda");
    if (storefrontHiddenReason({ ...sf, ownerActive: sf.retailerTenant.active }, new Date())) {
      throw new BadRequestException("Esa tienda no está recibiendo pedidos ahora");
    }
    const link = await this.prisma.tenantLink.findUnique({
      where: { clientTenantId_supplierTenantId: { clientTenantId: buyerTenantId, supplierTenantId: sf.supplierTenantId } },
      select: { status: true },
    });
    if (link?.status !== "LIST_CONNECTED") throw new ForbiddenException("No seguís esa tienda");
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
        const [products, orders, pending, buyers] = await Promise.all([
          this.prisma.supplierBaseOffer.count({ where: { provider: key } }),
          this.prisma.providerOrder.count({ where: this.visibleOrderWhere(key) }),
          this.prisma.providerOrder.count({ where: { ...this.visibleOrderWhere(key), storefrontStatus: "PENDING" } }),
          this.prisma.storefrontAudience.count({ where: { storefrontId: sf.id, status: "ACCEPTED" } }),
        ]);
        return {
          id: sf.id,
          retailerTenantId: sf.retailerTenantId,
          name: storefrontPublicName(sf, sf.retailerTenant.name),
          orgName: sf.retailerTenant.name,
          provider: key,
          status: sf.status,
          visibility: sf.visibility,
          suspendedReason: sf.suspendedReason,
          hiddenReason: storefrontHiddenReason({ ...sf, ownerActive: sf.retailerTenant.active }, now),
          stockConfirmedAt: sf.stockConfirmedAt?.toISOString() ?? null,
          contactPhone: sf.contactPhone,
          products,
          orders,
          pendingOrders: pending,
          buyers,
          createdAt: sf.createdAt.toISOString(),
        };
      })
    );
  }

  async adminSetStatus(id: string, status: "ACTIVE" | "SUSPENDED", reason?: string | null) {
    const sf = await this.prisma.storefront.findUnique({ where: { id } });
    if (!sf) throw new NotFoundException("Tienda no encontrada");
    if (status === "SUSPENDED" && !clean(reason, 500)) throw new BadRequestException("Indicá el motivo");
    if (status === "ACTIVE" && sf.status === "CLOSED") throw new ConflictException("La cerró el dueño: la reabre él");
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
    if (status === "ACTIVE") await this.audience.sync(id);
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

/** Token del link de invitación: 24 caracteres url-safe, imposible de adivinar. */
function newInviteToken(): string {
  return randomBytes(18).toString("base64url");
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

function cleanEmail(value: string | null | undefined): string | null {
  const v = clean(value, 200)?.toLowerCase() ?? null;
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
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
