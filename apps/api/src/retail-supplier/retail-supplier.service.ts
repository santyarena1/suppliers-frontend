import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { isListProviderKey, makeListProviderKey, type Provider } from "@nodo/shared";
import { CatalogEnrichmentService } from "../catalog/catalog-enrichment.service";
import { listDiscountKey } from "../providers/catalog-view";
import { ProvidersService } from "../providers/providers.service";
import type { NormalizedProduct } from "../providers/types";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { RETAIL_FRESH_MS } from "../retail/retail-search.service";

/** IVA con el que se separa el neto del precio publicado (los locales publican con IVA). */
const MAX_DISCOUNT = 90;
const CHUNK = 200;

export interface DiscountRuleInput {
  kind: "CATEGORY" | "BRAND";
  label: string;
  percent: number;
}

/**
 * Locales de venta que NODO lee (HardGamers, Compra Gamer...) como proveedores.
 *
 * Cada local elegido es un proveedor por lista (`LIST_RETAIL_*`) sin dueño: no
 * hay comercio asignado, vendedor ni chat. Su catálogo sale del scrapeo y se
 * copia como lista base; cada comercio que lo elige ve esa lista con sus propios
 * descuentos (general en el vínculo, por categoría o marca en ListDiscountRule).
 */
/** Cada cuánto se recopia un local aunque no haya cambiado nada. */
const RECOPY_MS = 3 * 60 * 60_000;

@Injectable()
export class RetailSupplierService {
  private readonly logger = new Logger(RetailSupplierService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
    private readonly enrichment: CatalogEnrichmentService
  ) {}

  /** Locales que se pueden elegir, con cuántos productos tienen y si el comercio ya lo eligió. */
  async listStores(tenant: TenantContext, q?: string) {
    const term = q?.trim();
    const stores = await this.prisma.retailStore.findMany({
      where: { active: true, ...(term ? { name: { contains: term, mode: "insensitive" } } : {}) },
      select: { id: true, name: true, logoUrl: true, retailSupplier: { select: { supplierTenantId: true, supplierTenant: { select: { providerKey: true } } } } },
      orderBy: { name: "asc" },
    });
    const counts = await this.prisma.retailProduct.groupBy({
      by: ["storeId"],
      where: { active: true, storeId: { in: stores.map((s) => s.id) } },
      _count: { _all: true },
    });
    const countBy = new Map(counts.map((c) => [c.storeId, c._count._all]));
    const links = await this.prisma.tenantLink.findMany({
      where: {
        clientTenantId: tenant.tenantId,
        status: { in: ["ACTIVE", "LIST_CONNECTED"] },
        supplierTenantId: { in: stores.flatMap((s) => (s.retailSupplier ? [s.retailSupplier.supplierTenantId] : [])) },
      },
      select: { supplierTenantId: true, discountPercent: true },
    });
    const linkBy = new Map(links.map((l) => [l.supplierTenantId, l]));
    return stores
      .map((s) => {
        const link = s.retailSupplier ? linkBy.get(s.retailSupplier.supplierTenantId) : undefined;
        return {
          id: s.id,
          name: s.name,
          logoUrl: s.logoUrl,
          products: countBy.get(s.id) ?? 0,
          connected: Boolean(link),
          provider: s.retailSupplier?.supplierTenant.providerKey ?? null,
          discountPercent: link?.discountPercent == null ? null : Number(link.discountPercent),
        };
      })
      .filter((s) => s.products > 0 || s.connected)
      .sort((a, b) => Number(b.connected) - Number(a.connected) || b.products - a.products);
  }

  /** El comercio suma el local como proveedor: lo crea si hace falta, copia el catálogo y lo materializa. */
  async connect(tenant: TenantContext, retailStoreId: string) {
    const store = await this.prisma.retailStore.findFirst({ where: { id: retailStoreId, active: true }, select: { id: true, name: true } });
    if (!store) throw new NotFoundException("Ese local ya no está disponible");
    const supplier = await this.ensureSupplier(store);
    await this.prisma.$transaction([
      this.prisma.tenantLink.upsert({
        where: { clientTenantId_supplierTenantId: { clientTenantId: tenant.tenantId, supplierTenantId: supplier.supplierTenantId } },
        create: { clientTenantId: tenant.tenantId, supplierTenantId: supplier.supplierTenantId, status: "LIST_CONNECTED" },
        update: { status: "LIST_CONNECTED" },
      }),
      // El local no publica stock: solo lista lo que tiene. Ocultar «sin stock» lo escondería todo.
      this.prisma.providerSyncConfig.upsert({
        where: { tenantId_provider: { tenantId: tenant.tenantId, provider: supplier.providerKey } },
        create: { tenantId: tenant.tenantId, provider: supplier.providerKey, enabled: false, priceChannel: "LIST", zeroStockAction: "KEEP" },
        update: { zeroStockAction: "KEEP" },
      }),
    ]);
    // La primera copia de un local grande tarda: corre aparte y el comercio sigue.
    const provider = supplier.providerKey as Provider;
    const work = supplier.syncedAt
      ? this.providers.materializeBaseOffers(tenant.tenantId, provider)
      : this.syncSupplier(supplier.id).then(() => this.materializeLinked(supplier.id));
    void work.catch((err) => this.logger.warn(`Sumar ${provider} a ${tenant.tenantId}: ${msg(err)}`));
    return { provider: supplier.providerKey, name: supplier.name, preparing: !supplier.syncedAt };
  }

  /** Deja de verlo como proveedor (el historial queda). */
  async disconnect(tenant: TenantContext, retailStoreId: string) {
    const supplier = await this.prisma.retailSupplier.findUnique({
      where: { retailStoreId },
      select: { supplierTenantId: true, supplierTenant: { select: { providerKey: true } } },
    });
    if (!supplier?.supplierTenant.providerKey) throw new NotFoundException("No tenés ese local como proveedor");
    const provider = supplier.supplierTenant.providerKey;
    await this.prisma.$transaction([
      this.prisma.tenantLink.updateMany({
        where: { clientTenantId: tenant.tenantId, supplierTenantId: supplier.supplierTenantId },
        data: { status: "REVOKED" },
      }),
      this.prisma.tenantProductOffer.updateMany({ where: { tenantId: tenant.tenantId, provider, active: true }, data: { active: false } }),
      this.prisma.providerSyncConfig.updateMany({
        where: { tenantId: tenant.tenantId, provider },
        data: { includeInSearch: null, includeInSearchAt: null },
      }),
    ]);
    return { ok: true };
  }

  /**
   * Link para abrir en el local un carrito con estos productos. Por ahora solo
   * Compra Gamer lo permite. `url: null` = ese local no tiene carrito por link.
   */
  async cartLink(tenant: TenantContext, provider: string, items: { externalId: string; qty: number }[]) {
    await this.requireListLink(tenant, provider);
    const fichas = await this.prisma.providerSyncCache.findMany({
      where: { provider, externalId: { in: items.map((i) => i.externalId) } },
      select: { externalId: true, raw: true },
    });
    const idBy = new Map(fichas.map((f) => [f.externalId, compragamerRaw(f.raw).compragamerId ?? null]));
    if (![...idBy.values()].some(Boolean)) return { url: null, missing: [] as string[] };
    const lines = items.map((i) => ({ externalId: i.externalId, compragamerId: idBy.get(i.externalId) ?? null, qty: i.qty }));
    return {
      url: compragamerCartUrl(lines.filter((l) => l.compragamerId)),
      missing: lines.filter((l) => !l.compragamerId).map((l) => l.externalId),
    };
  }

  // ---------- Descuentos (cualquier proveedor por lista vinculado) ----------

  async getDiscounts(tenant: TenantContext, provider: string) {
    const link = await this.requireListLink(tenant, provider);
    const [rules, labels] = await Promise.all([
      this.prisma.listDiscountRule.findMany({
        where: { tenantId: tenant.tenantId, provider },
        select: { kind: true, label: true, percent: true },
        orderBy: [{ kind: "asc" }, { label: "asc" }],
      }),
      this.catalogLabels(tenant.tenantId, provider),
    ]);
    return {
      provider,
      general: link.discountPercent == null ? null : Number(link.discountPercent),
      rules: rules.map((r) => ({ kind: r.kind, label: r.label, percent: Number(r.percent) })),
      categories: labels.categories,
      brands: labels.brands,
    };
  }

  /** Reemplaza el descuento general y todas las reglas por categoría y marca. */
  async setDiscounts(tenant: TenantContext, provider: string, general: number | null, rules: DiscountRuleInput[]) {
    const link = await this.requireListLink(tenant, provider);
    const clean = new Map<string, { kind: "CATEGORY" | "BRAND"; key: string; label: string; percent: number }>();
    for (const r of rules) {
      const label = r.label?.trim();
      if (!label) continue;
      const key = listDiscountKey(r.kind, label);
      if (!key) continue;
      clean.set(`${r.kind}:${key}`, { kind: r.kind, key, label: label.slice(0, 120), percent: checkPercent(r.percent) });
    }
    await this.prisma.$transaction([
      this.prisma.tenantLink.update({
        where: { id: link.id },
        data: { discountPercent: general == null || general === 0 ? null : checkPercent(general) },
      }),
      this.prisma.listDiscountRule.deleteMany({ where: { tenantId: tenant.tenantId, provider } }),
      this.prisma.listDiscountRule.createMany({
        data: [...clean.values()].map((r) => ({ tenantId: tenant.tenantId, provider, ...r, percent: new Prisma.Decimal(r.percent) })),
      }),
    ]);
    return this.getDiscounts(tenant, provider);
  }

  // ---------- Catálogo ----------

  /** Cada hora: los locales elegidos cuyo scrapeo cambió desde la última copia. */
  @Cron("17 * * * *")
  async refreshChanged() {
    if (this.running) return;
    this.running = true;
    try {
      const suppliers = await this.prisma.retailSupplier.findMany({ select: { id: true, retailStoreId: true, syncedAt: true } });
      for (const s of suppliers) {
        const changed = await this.prisma.retailProduct.findFirst({
          where: { storeId: s.retailStoreId, ...(s.syncedAt ? { updatedAt: { gt: s.syncedAt } } : {}) },
          select: { id: true },
        });
        // Aunque el local no cambie, se vuelve a copiar cada tanto: así sale lo que se venció.
        const due = !s.syncedAt || Date.now() - s.syncedAt.getTime() > RECOPY_MS;
        if (!changed && !due) continue;
        try {
          await this.syncSupplier(s.id);
          await this.materializeLinked(s.id);
        } catch (err) {
          this.logger.warn(`Local ${s.retailStoreId}: no se pudo actualizar el catálogo: ${msg(err)}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Copia el catálogo activo del local a la lista base del proveedor. */
  async syncSupplier(retailSupplierId: string) {
    const supplier = await this.prisma.retailSupplier.findUniqueOrThrow({
      where: { id: retailSupplierId },
      select: {
        id: true,
        retailStoreId: true,
        supplierTenantId: true,
        supplierTenant: { select: { providerKey: true } },
        retailStore: { select: { logoUrl: true } },
      },
    });
    const provider = supplier.supplierTenant.providerKey as Provider;
    const startedAt = new Date();
    await this.syncLogo(provider, supplier.retailStore.logoUrl);
    const products = await this.prisma.retailProduct.findMany({
      // Lo que el local no volvió a publicar en 24 h no se copia: su precio ya no está confirmado.
      where: { storeId: supplier.retailStoreId, active: true, syncedAt: { gte: new Date(Date.now() - RETAIL_FRESH_MS) } },
      select: { externalId: true, name: true, price: true, currency: true, productUrl: true, imageUrl: true, categoryName: true, raw: true },
    });
    const items: NormalizedProduct[] = products.flatMap((p) => {
      const finalPrice = Number(p.price);
      if (!(finalPrice > 0)) return [];
      return [{
        externalId: String(p.externalId),
        name: p.name,
        category: p.categoryName ?? undefined,
        productUrl: p.productUrl ?? undefined,
        imageUrl: p.imageUrl ?? undefined,
        finalPrice: round4(finalPrice),
        // Precio de venta al público: el IVA ya está adentro y no se discrimina
        // (sin alícuota, NODO lo muestra igual con o sin IVA).
        price: round4(finalPrice),
        currency: p.currency || "ARS",
        stockStatus: "Publicado en el local",
        raw: { retailExternalId: p.externalId, ...compragamerRaw(p.raw) },
      }];
    });

    await this.providers.applyListOffers({ tenantId: supplier.supplierTenantId, provider, items, source: "BASE_LIST" });
    for (let i = 0; i < items.length; i += CHUNK) {
      await this.prisma.$transaction(
        items.slice(i, i + CHUNK).map((item) => {
          const offer = {
            price: item.price,
            finalPrice: item.finalPrice,
            currency: item.currency,
            ivaPercent: null,
            stock: null,
            stockStatus: item.stockStatus,
          };
          return this.prisma.supplierBaseOffer.upsert({
            where: { provider_externalId: { provider, externalId: item.externalId } },
            create: { provider, externalId: item.externalId, ...offer },
            update: { ...offer, syncedAt: new Date() },
          });
        })
      );
    }
    // Lo que el local dejó de publicar sale de la lista y de los comercios.
    const gone = await this.prisma.supplierBaseOffer.findMany({
      where: { provider, syncedAt: { lt: startedAt } },
      select: { externalId: true },
    });
    if (gone.length) {
      const ids = gone.map((g) => g.externalId);
      await this.prisma.supplierBaseOffer.deleteMany({ where: { provider, externalId: { in: ids } } });
      await this.prisma.tenantProductOffer.updateMany({
        where: { provider, source: "BASE_LIST", externalId: { in: ids }, active: true },
        data: { active: false },
      });
    }
    await this.enrichment
      .autoAssignKnownBrands(provider)
      .catch((err) => this.logger.warn(`Marcas de ${provider}: ${msg(err)}`));
    await this.prisma.retailSupplier.update({ where: { id: supplier.id }, data: { syncedAt: startedAt } });
    this.logger.log(`Local ${provider}: ${items.length} productos copiados, ${gone.length} dados de baja`);
  }

  /** El logo del local es el del proveedor en todo NODO. Uno cargado a mano en Administración no se pisa. */
  private async syncLogo(provider: string, logoUrl: string | null) {
    if (!logoUrl) return;
    const current = await this.prisma.providerDisplayConfig.findUnique({ where: { provider }, select: { logoUrl: true } });
    if (current?.logoUrl) return;
    await this.prisma.providerDisplayConfig.upsert({
      where: { provider },
      create: { provider, logoUrl },
      update: { logoUrl },
    });
  }

  private async materializeLinked(retailSupplierId: string) {
    const supplier = await this.prisma.retailSupplier.findUniqueOrThrow({
      where: { id: retailSupplierId },
      select: { supplierTenantId: true, supplierTenant: { select: { providerKey: true } } },
    });
    const provider = supplier.supplierTenant.providerKey as Provider;
    const links = await this.prisma.tenantLink.findMany({
      where: { supplierTenantId: supplier.supplierTenantId, status: { in: ["ACTIVE", "LIST_CONNECTED"] }, clientTenant: { active: true } },
      select: { clientTenantId: true },
    });
    for (const l of links) {
      await this.providers
        .materializeBaseOffers(l.clientTenantId, provider)
        .catch((err) => this.logger.warn(`Materializar ${provider} en ${l.clientTenantId}: ${msg(err)}`));
    }
  }

  private async ensureSupplier(store: { id: string; name: string }) {
    const select = { id: true, supplierTenantId: true, syncedAt: true, supplierTenant: { select: { providerKey: true, name: true } } } as const;
    const flat = (s: Prisma.RetailSupplierGetPayload<{ select: typeof select }>) => ({
      id: s.id,
      supplierTenantId: s.supplierTenantId,
      syncedAt: s.syncedAt,
      providerKey: s.supplierTenant.providerKey as string,
      name: s.supplierTenant.name,
    });
    const existing = await this.prisma.retailSupplier.findUnique({ where: { retailStoreId: store.id }, select });
    if (existing) return flat(existing);
    for (let attempt = 1; attempt <= 10; attempt++) {
      const name = attempt === 1 ? store.name : `${store.name} (local${attempt > 2 ? ` ${attempt - 1}` : ""})`;
      const providerKey = await this.freeProviderKey(`RETAIL ${store.name}`);
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: { name, type: "DISTRIBUTOR", providerKey, managedByPlatform: true, notes: "Local de venta leído por NODO (HardGamers / Compra Gamer)" },
            select: { id: true },
          });
          return tx.retailSupplier.create({ data: { retailStoreId: store.id, supplierTenantId: tenant.id }, select });
        });
        return flat(created);
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
        const raced = await this.prisma.retailSupplier.findUnique({ where: { retailStoreId: store.id }, select });
        if (raced) return flat(raced);
      }
    }
    throw new ConflictException("No se pudo dar de alta el local como proveedor");
  }

  private async freeProviderKey(name: string): Promise<string> {
    const base = makeListProviderKey(name);
    if (!base) throw new BadRequestException("El nombre del local no sirve para armar el proveedor");
    const taken = await this.prisma.tenant.findMany({ where: { providerKey: { startsWith: base } }, select: { providerKey: true } });
    const used = new Set(taken.map((t) => t.providerKey));
    if (!used.has(base)) return base;
    for (let n = 2; n < 1000; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
    throw new ConflictException("No se pudo generar una clave para el local");
  }

  private async requireListLink(tenant: TenantContext, provider: string) {
    if (!isListProviderKey(provider)) throw new BadRequestException("Los descuentos son para proveedores por lista o locales");
    const link = await this.prisma.tenantLink.findFirst({
      where: { clientTenantId: tenant.tenantId, status: { in: ["ACTIVE", "LIST_CONNECTED"] }, supplierTenant: { providerKey: provider } },
      select: { id: true, discountPercent: true },
    });
    if (!link) throw new NotFoundException("No tenés ese proveedor");
    return link;
  }

  /** Categorías y marcas que aparecen en el catálogo de ese proveedor, para elegir. */
  private async catalogLabels(tenantId: string, provider: string) {
    const rows = await this.prisma.providerSyncCache.findMany({
      where: { provider, offers: { some: { tenantId, active: true } } },
      select: { brand: true, category: true },
    });
    const count = (values: (string | null)[]) => {
      const m = new Map<string, number>();
      for (const v of values) if (v?.trim()) m.set(v.trim(), (m.get(v.trim()) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, products]) => ({ label, products }));
    };
    return { categories: count(rows.map((r) => r.category)), brands: count(rows.map((r) => r.brand)) };
  }
}

/** Id de Compra Gamer guardado por el scrapeo, si es de ese local. */
function compragamerRaw(raw: Prisma.JsonValue | null): { compragamerId?: number } {
  const id = raw && typeof raw === "object" && !Array.isArray(raw) ? Number((raw as Record<string, unknown>).compragamerId) : NaN;
  return Number.isInteger(id) && id > 0 ? { compragamerId: id } : {};
}

/**
 * Link al carrito de Compra Gamer con los productos ya cargados: su web lee
 * `listado_prod=cantidad-idProducto,...` y arma el carrito (el comercio entra
 * con su cuenta y paga ahí). `null` si falta el id de algún producto.
 */
export function compragamerCartUrl(lines: { compragamerId: number | null; qty: number }[]): string | null {
  if (lines.length === 0 || lines.some((l) => !l.compragamerId || !(l.qty > 0))) return null;
  const list = lines.map((l) => `${Math.floor(l.qty)}-${l.compragamerId}`).join(",");
  return `https://compragamer.com/carro-compras?listado_prod=${encodeURIComponent(list)}`;
}

function checkPercent(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_DISCOUNT) throw new BadRequestException(`El descuento tiene que estar entre 0 y ${MAX_DISCOUNT} %`);
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
