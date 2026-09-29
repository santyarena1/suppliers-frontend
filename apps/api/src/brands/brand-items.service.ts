import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type BrandItemState, type BrandStockLevel } from "@prisma/client";
import { providerLabel } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { hasPermission } from "../tenants/tenant-roles";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import { brandMatchNames } from "./brand-names";
import {
  DEFAULT_STOCK_SETTINGS,
  groupSkusIntoItems,
  semaphoreStatus,
  validStockSettings,
  type CatalogSku,
  type SemaphoreStatus,
  type StockSettings,
} from "./brand-stock";

/** Quién mira: define si ve unidades exactas y qué distribuidores resalta. */
type Audience =
  | { kind: "brand"; seesExact: boolean }
  | { kind: "client"; yourProviders: Set<string> }
  | { kind: "public" };

export interface AvailabilityDistributor {
  provider: string;
  label: string;
  status: SemaphoreStatus;
  /** Solo para la marca que eligió ver el stock exacto. */
  stock?: number | null;
  /** Para un comercio: es uno de sus distribuidores (puede comprarle). */
  yours?: boolean;
  linkId?: string;
  manualLevel?: BrandStockLevel | null;
}

export interface AvailabilityItem {
  id: string;
  name: string;
  imageUrl: string | null;
  partNumber: string | null;
  ean: string | null;
  referencePrice: number | null;
  currency: string;
  state: BrandItemState | null;
  incomingAt: string | null;
  notes: string | null;
  distributors: AvailabilityDistributor[];
}

export interface StockSettingsView extends StockSettings {
  brandSeesExact: boolean;
  publicStock: boolean;
}

const LINK_CHUNK = 200;

function key(provider: string, externalId: string) {
  return `${provider}:${externalId}`;
}

/**
 * Productos de la marca y su semáforo por distribuidor.
 * Diseño: docs/superpowers/specs/2026-09-29-marcas-semaforo-design.md
 */
@Injectable()
export class BrandItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: TenantVisibilityService
  ) {}

  // ---------- Panel de la marca ----------

  private assertBrand(tenant: TenantContext, write = false) {
    if (tenant.tenantType !== "BRAND") throw new ForbiddenException("Esto es del panel de marca");
    if (write && !hasPermission(tenant, "brand.manage")) {
      throw new ForbiddenException("No tenés permiso para gestionar los productos de la marca");
    }
  }

  async settingsFor(brandId: string): Promise<StockSettingsView> {
    const row = await this.prisma.brandStockSettings.findUnique({ where: { tenantId: brandId } });
    return {
      mode: row?.mode ?? DEFAULT_STOCK_SETTINGS.mode,
      lowBelow: row?.lowBelow ?? DEFAULT_STOCK_SETTINGS.lowBelow,
      highFrom: row?.highFrom ?? DEFAULT_STOCK_SETTINGS.highFrom,
      brandSeesExact: row?.brandSeesExact ?? false,
      publicStock: row?.publicStock ?? true,
    };
  }

  async updateSettings(tenant: TenantContext, patch: Partial<StockSettingsView>) {
    this.assertBrand(tenant, true);
    const current = await this.settingsFor(tenant.tenantId);
    const next = { ...current, ...patch };
    if (!validStockSettings(next)) {
      throw new BadRequestException("Los rangos no cierran: 'Bajo' tiene que ser al menos 1 y 'Alto' mayor que 'Bajo'.");
    }
    await this.prisma.brandStockSettings.upsert({
      where: { tenantId: tenant.tenantId },
      create: { tenantId: tenant.tenantId, ...next },
      update: next,
    });
    return next;
  }

  /** Códigos de la marca en los distribuidores que todavía no son de ningún producto, agrupados. */
  async suggestions(tenant: TenantContext) {
    this.assertBrand(tenant);
    const names = await brandMatchNames(this.prisma, tenant.tenantId);
    if (names.length === 0) return { items: [] };
    const [rows, linked] = await Promise.all([
      this.prisma.providerSyncCache.findMany({
        where: { OR: names.map((name) => ({ brand: { equals: name, mode: "insensitive" as const } })) },
        select: { provider: true, externalId: true, name: true, ean: true, partNumber: true, imageUrl: true },
        orderBy: { name: "asc" },
        take: 3000,
      }),
      this.prisma.brandItemLink.findMany({
        where: { item: { tenantId: tenant.tenantId } },
        select: { provider: true, externalId: true },
      }),
    ]);
    const taken = new Set(linked.map((l) => key(l.provider, l.externalId)));
    const free: CatalogSku[] = rows.filter((row) => !taken.has(key(row.provider, row.externalId)));
    const items = groupSkusIntoItems(free)
      // Primero lo que está en más distribuidores: es lo que más le sirve ordenar.
      .sort((a, b) => b.skus.length - a.skus.length)
      .map((item) => ({
        ...item,
        skus: item.skus.map((s) => ({ ...s, label: providerLabel(s.provider) })),
      }));
    return { items };
  }

  async createItems(
    tenant: TenantContext,
    items: { name: string; partNumber?: string | null; ean?: string | null; imageUrl?: string | null; skus: { provider: string; externalId: string }[] }[]
  ) {
    this.assertBrand(tenant, true);
    const valid = items.filter((item) => item.name?.trim());
    if (valid.length === 0) throw new BadRequestException("No hay productos para crear");
    const last = await this.prisma.brandItem.aggregate({ where: { tenantId: tenant.tenantId }, _max: { position: true } });
    let position = (last._max.position ?? 0) + 1;
    await this.prisma.$transaction(
      valid.map((item) =>
        this.prisma.brandItem.create({
          data: {
            tenantId: tenant.tenantId,
            name: item.name.trim(),
            partNumber: item.partNumber?.trim() || null,
            ean: item.ean?.trim() || null,
            imageUrl: item.imageUrl ?? null,
            position: position++,
            links: {
              create: dedupeSkus(item.skus).map((sku) => ({ provider: sku.provider, externalId: sku.externalId })),
            },
          },
        })
      )
    );
    return this.brandView(tenant);
  }

  async updateItem(
    tenant: TenantContext,
    itemId: string,
    patch: {
      name?: string;
      referencePrice?: number | null;
      currency?: string;
      state?: BrandItemState | null;
      incomingAt?: string | null;
      notes?: string | null;
      imageUrl?: string | null;
      active?: boolean;
    }
  ) {
    this.assertBrand(tenant, true);
    await this.ownItem(tenant, itemId);
    await this.prisma.brandItem.update({
      where: { id: itemId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.referencePrice !== undefined
          ? { referencePrice: patch.referencePrice === null ? null : new Prisma.Decimal(patch.referencePrice) }
          : {}),
        ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.incomingAt !== undefined ? { incomingAt: patch.incomingAt ? new Date(patch.incomingAt) : null } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
      },
    });
    return this.brandView(tenant);
  }

  async deleteItem(tenant: TenantContext, itemId: string) {
    this.assertBrand(tenant, true);
    await this.ownItem(tenant, itemId);
    await this.prisma.brandItem.delete({ where: { id: itemId } });
    return this.brandView(tenant);
  }

  async addLink(tenant: TenantContext, itemId: string, sku: { provider: string; externalId: string }) {
    this.assertBrand(tenant, true);
    await this.ownItem(tenant, itemId);
    const exists = await this.prisma.providerSyncCache.findUnique({
      where: { provider_externalId: { provider: sku.provider, externalId: sku.externalId } },
      select: { provider: true },
    });
    if (!exists) throw new NotFoundException("Ese código no está en el catálogo de ese distribuidor");
    await this.prisma.brandItemLink.upsert({
      where: { brandItemId_provider_externalId: { brandItemId: itemId, provider: sku.provider, externalId: sku.externalId } },
      create: { brandItemId: itemId, provider: sku.provider, externalId: sku.externalId },
      update: {},
    });
    return this.brandView(tenant);
  }

  async updateLink(tenant: TenantContext, linkId: string, manualLevel: BrandStockLevel | null) {
    this.assertBrand(tenant, true);
    await this.ownLink(tenant, linkId);
    await this.prisma.brandItemLink.update({ where: { id: linkId }, data: { manualLevel } });
    return this.brandView(tenant);
  }

  async removeLink(tenant: TenantContext, linkId: string) {
    this.assertBrand(tenant, true);
    await this.ownLink(tenant, linkId);
    await this.prisma.brandItemLink.delete({ where: { id: linkId } });
    return this.brandView(tenant);
  }

  /** Lo que ve la marca en su panel. */
  async brandView(tenant: TenantContext) {
    this.assertBrand(tenant);
    const settings = await this.settingsFor(tenant.tenantId);
    const items = await this.availability(tenant.tenantId, settings, { kind: "brand", seesExact: settings.brandSeesExact }, true);
    return { settings, canWrite: hasPermission(tenant, "brand.manage"), items };
  }

  // ---------- Lo que ven los demás ----------

  /** Comercio o distribuidor vinculado con la marca. */
  async clientView(tenant: TenantContext, linkId: string) {
    const link = await this.prisma.tenantLink.findFirst({
      where: {
        id: linkId,
        clientTenantId: tenant.tenantId,
        status: { in: ["ACTIVE", "SUSPENDED"] },
        supplierTenant: { type: "BRAND" },
      },
      select: { supplierTenantId: true },
    });
    if (!link) throw new NotFoundException("Esa marca no está vinculada");
    return this.clientViewFor(tenant, link.supplierTenantId);
  }

  /**
   * Disponibilidad para un cliente ya validado contra el vínculo (el hub lo valida).
   * Solo un comercio tiene "sus distribuidores"; un distro cliente de la marca ve el mapa sin marcar.
   */
  async clientViewFor(tenant: TenantContext, brandId: string) {
    const yourProviders = new Set<string>();
    if (tenant.tenantType === "RETAILER") {
      const mine = await this.visibility.listFor(commercialId(tenant), tenant.userId);
      for (const p of mine) if (p.linked) yourProviders.add(p.provider);
    }
    const settings = await this.settingsFor(brandId);
    const items = await this.availability(brandId, settings, { kind: "client", yourProviders });
    return { mode: settings.mode, items };
  }

  /** Link público: solo si la landing está publicada y la marca muestra stock afuera. */
  async publicView(publicKey: string) {
    const landing = await this.prisma.brandLanding.findUnique({
      where: { publicKey },
      select: { published: true, tenantId: true, tenant: { select: { active: true, type: true } } },
    });
    if (!landing?.published || !landing.tenant.active || landing.tenant.type !== "BRAND") {
      throw new NotFoundException("Landing no encontrada");
    }
    const settings = await this.settingsFor(landing.tenantId);
    if (!settings.publicStock) return { mode: settings.mode, items: [] as AvailabilityItem[], hidden: true };
    const items = await this.availability(landing.tenantId, settings, { kind: "public" });
    return { mode: settings.mode, items, hidden: false };
  }

  // ---------- Interno ----------

  private async availability(
    brandId: string,
    settings: StockSettings,
    audience: Audience,
    includeInactive = false
  ): Promise<AvailabilityItem[]> {
    const items = await this.prisma.brandItem.findMany({
      where: { tenantId: brandId, ...(includeInactive ? {} : { active: true }) },
      include: { links: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    const stock = await this.freshestStock(items.flatMap((item) => item.links));
    const now = new Date();

    return items.map((item) => {
      const distributors = item.links.map((link): AvailabilityDistributor => {
        const found = stock.get(key(link.provider, link.externalId));
        const status = semaphoreStatus({
          settings,
          itemState: item.state,
          manualLevel: link.manualLevel,
          stock: found?.stock ?? null,
          syncedAt: found?.syncedAt ?? null,
          now,
        });
        const base: AvailabilityDistributor = { provider: link.provider, label: providerLabel(link.provider), status };
        if (audience.kind === "brand") {
          return {
            ...base,
            linkId: link.id,
            manualLevel: link.manualLevel,
            ...(audience.seesExact ? { stock: found?.stock ?? null } : {}),
          };
        }
        if (audience.kind === "client") return { ...base, yours: audience.yourProviders.has(link.provider) };
        return base;
      });
      // Para el comercio, primero sus distribuidores (a los que puede comprarles).
      if (audience.kind === "client") distributors.sort((a, b) => Number(Boolean(b.yours)) - Number(Boolean(a.yours)));
      return {
        id: item.id,
        name: item.name,
        imageUrl: item.imageUrl,
        partNumber: item.partNumber,
        ean: item.ean,
        referencePrice: item.referencePrice === null ? null : Number(item.referencePrice),
        currency: item.currency,
        state: item.state,
        incomingAt: item.incomingAt?.toISOString() ?? null,
        notes: audience.kind === "brand" ? item.notes : null,
        distributors,
      };
    });
  }

  /**
   * Stock de cada código: el de la sincronización más reciente entre todas las
   * organizaciones. El stock de un distribuidor es el mismo para cualquier
   * comercio; lo que cambia es quién lo trajo último.
   */
  private async freshestStock(links: { provider: string; externalId: string }[]) {
    const out = new Map<string, { stock: number | null; syncedAt: Date }>();
    const pairs = [...new Map(links.map((l) => [key(l.provider, l.externalId), l])).values()];
    for (let i = 0; i < pairs.length; i += LINK_CHUNK) {
      const chunk = pairs.slice(i, i + LINK_CHUNK);
      const offers = await this.prisma.tenantProductOffer.findMany({
        where: { OR: chunk.map((p) => ({ provider: p.provider, externalId: p.externalId })) },
        select: { provider: true, externalId: true, stock: true, syncedAt: true },
        orderBy: { syncedAt: "desc" },
      });
      for (const offer of offers) {
        const k = key(offer.provider, offer.externalId);
        if (!out.has(k)) out.set(k, { stock: offer.stock, syncedAt: offer.syncedAt });
      }
    }
    return out;
  }

  private async ownItem(tenant: TenantContext, itemId: string) {
    const item = await this.prisma.brandItem.findUnique({ where: { id: itemId }, select: { tenantId: true } });
    if (!item || item.tenantId !== tenant.tenantId) throw new NotFoundException("Producto no encontrado");
  }

  private async ownLink(tenant: TenantContext, linkId: string) {
    const link = await this.prisma.brandItemLink.findUnique({
      where: { id: linkId },
      select: { item: { select: { tenantId: true } } },
    });
    if (!link || link.item.tenantId !== tenant.tenantId) throw new NotFoundException("Código no encontrado");
  }
}

function dedupeSkus(skus: { provider: string; externalId: string }[]) {
  return [...new Map((skus ?? []).map((s) => [key(s.provider, s.externalId), s])).values()];
}
