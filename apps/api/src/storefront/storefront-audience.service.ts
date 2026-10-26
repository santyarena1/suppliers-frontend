import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma, StorefrontAudienceStatus } from "@prisma/client";
import type { Provider } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ProvidersService } from "../providers/providers.service";
import { commercialId, type TenantContext } from "../tenants/tenant-context.service";
import { assertPermission } from "../tenants/tenant-roles";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import { stockState, storefrontHiddenReason, storefrontPublicName } from "./storefront-rules";

const SF_INCLUDE = {
  retailerTenant: { select: { id: true, name: true, active: true } },
  supplierTenant: { select: { id: true, providerKey: true } },
} as const;

type SfRow = Prisma.StorefrontGetPayload<{ include: typeof SF_INCLUDE }>;

/**
 * Quién ve cada tienda (docs/PLAN_VENDER_EN_NODO.md). Una tienda pública se le
 * ofrece a cada comercio ("X está vendiendo en NODO, ¿querés ver sus
 * productos?") y el comercio la acepta o no; una privada solo entra con el link
 * de invitación. Ver una tienda = un vínculo por lista `LIST_CONNECTED`; dejar de
 * verla = el vínculo `REVOKED`. El buscador, las fichas y el carrito son los de
 * cualquier lista.
 */
@Injectable()
export class StorefrontAudienceService {
  private readonly logger = new Logger(StorefrontAudienceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
    private readonly visibility: TenantVisibilityService
  ) {}

  // ---------- Vínculos ----------

  /** El comercio ve la tienda: vínculo por lista y catálogo materializado. */
  async connect(sf: { supplierTenantId: string; providerKey: string }, buyerTenantId: string) {
    await this.prisma.$transaction([
      this.prisma.tenantLink.upsert({
        where: { clientTenantId_supplierTenantId: { clientTenantId: buyerTenantId, supplierTenantId: sf.supplierTenantId } },
        create: { clientTenantId: buyerTenantId, supplierTenantId: sf.supplierTenantId, status: "LIST_CONNECTED" },
        update: { status: "LIST_CONNECTED" },
      }),
      // A un local no se le pide lo que no tiene: sin stock no se muestra. Si el
      // comercio ya tenía configuración para esta clave, no se pisa.
      this.prisma.providerSyncConfig.createMany({
        data: [{ tenantId: buyerTenantId, provider: sf.providerKey, enabled: false, priceChannel: "LIST", zeroStockAction: "HIDE" }],
        skipDuplicates: true,
      }),
    ]);
    await this.providers
      .materializeBaseOffers(buyerTenantId, sf.providerKey as Provider)
      .catch((err) => this.logger.warn(`Materializar tienda ${sf.providerKey} en ${buyerTenantId}: ${msg(err)}`));
  }

  /** El comercio deja de ver la tienda: igual que desconectar un proveedor, sin borrar historial. */
  async disconnect(sf: { supplierTenantId: string; providerKey: string }, buyerTenantId: string) {
    await this.prisma.$transaction([
      this.prisma.tenantLink.updateMany({
        where: { clientTenantId: buyerTenantId, supplierTenantId: sf.supplierTenantId },
        data: { status: "REVOKED" },
      }),
      this.prisma.tenantProductOffer.updateMany({
        where: { tenantId: buyerTenantId, provider: sf.providerKey, active: true },
        data: { active: false },
      }),
      this.prisma.providerSyncConfig.updateMany({
        where: { tenantId: buyerTenantId, provider: sf.providerKey },
        data: { includeInSearch: null, includeInSearchAt: null },
      }),
    ]);
  }

  /**
   * Pone al día quién ve la tienda. Pública, abierta y con algo para vender: a
   * cada comercio que todavía no la conoce se le ofrece (con un aviso). Siempre:
   * los que la aceptaron tienen el vínculo. Devuelve cuántos comercios nuevos se
   * la ofrecieron.
   */
  async sync(storefrontId: string): Promise<number> {
    const sf = await this.prisma.storefront.findUnique({ where: { id: storefrontId }, include: SF_INCLUDE });
    const providerKey = sf?.supplierTenant.providerKey;
    if (!sf || !providerKey) return 0;

    // Aceptados sin vínculo vigente (por ejemplo, después de reabrir): se reconectan.
    const accepted = await this.prisma.storefrontAudience.findMany({
      where: { storefrontId, status: "ACCEPTED", buyerTenant: { active: true } },
      select: { buyerTenantId: true },
    });
    if (accepted.length) {
      const linked = await this.prisma.tenantLink.findMany({
        where: {
          supplierTenantId: sf.supplierTenantId,
          clientTenantId: { in: accepted.map((a) => a.buyerTenantId) },
          status: "LIST_CONNECTED",
        },
        select: { clientTenantId: true },
      });
      const ok = new Set(linked.map((l) => l.clientTenantId));
      for (const a of accepted) {
        if (!ok.has(a.buyerTenantId)) await this.connect({ supplierTenantId: sf.supplierTenantId, providerKey }, a.buyerTenantId);
      }
    }

    if (sf.status !== "ACTIVE" || sf.visibility !== "PUBLIC") return 0;
    if (storefrontHiddenReason({ ...sf, ownerActive: sf.retailerTenant.active }, new Date())) return 0;
    const inStock = await this.prisma.supplierBaseOffer.count({
      where: { provider: providerKey, OR: [{ stock: null }, { stock: { gt: 0 } }] },
    });
    if (inStock === 0) return 0;

    // Solo los comercios que todavía no tienen fila: la base lo resuelve con el índice, sin traer a todos.
    const fresh = (
      await this.prisma.tenant.findMany({
        where: { type: "RETAILER", active: true, id: { not: sf.retailerTenantId }, storefrontAudiences: { none: { storefrontId } } },
        select: { id: true },
      })
    ).map((r) => r.id);
    if (fresh.length === 0) return 0;
    const name = storefrontPublicName(sf, sf.retailerTenant.name);
    await this.prisma.$transaction([
      this.prisma.storefrontAudience.createMany({
        data: fresh.map((buyerTenantId) => ({ storefrontId, buyerTenantId, status: "PENDING" as const, source: "PUBLIC" })),
        skipDuplicates: true,
      }),
      this.prisma.orgNotification.createMany({
        data: fresh.map((toTenantId) => ({
          toTenantId,
          fromTenantId: sf.retailerTenantId,
          kind: "SYSTEM" as const,
          title: `${name} está vendiendo en NODO`,
          body: "¿Querés ver sus productos en tu buscador? Aceptalo o no desde Configuración → Tiendas de locales.",
          landingKey: `storefront-offer:${sf.id}`,
        })),
      }),
    ]);
    return fresh.length;
  }

  /** La tienda pasa a privada: se retiran las propuestas que nadie contestó. */
  async withdrawPendingOffers(storefrontId: string) {
    await this.prisma.storefrontAudience.deleteMany({ where: { storefrontId, status: "PENDING", source: "PUBLIC" } });
  }

  // ---------- Lado comprador ----------

  private assertBuyer(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") throw new ForbiddenException("Las tiendas de locales son para comercios");
  }

  /** Tiendas que se le ofrecieron a este comercio y qué eligió (para Configuración y el aviso). */
  async offers(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") return [];
    const buyerId = commercialId(tenant);
    const rows = await this.prisma.storefrontAudience.findMany({
      where: { buyerTenantId: buyerId, status: { not: "REMOVED" } },
      include: { storefront: { include: SF_INCLUDE } },
      orderBy: { createdAt: "desc" },
    });
    const now = new Date();
    const hiddenByPlatform = await this.visibility.platformHiddenFor(buyerId, tenant.userId);
    const out = [];
    for (const r of rows) {
      const sf = r.storefront;
      const key = sf.supplierTenant.providerKey;
      if (!key || sf.retailerTenantId === buyerId) continue;
      // Oculta por la plataforma (Administración → Visibilidad): para este comercio no existe.
      if (hiddenByPlatform.has(key)) continue;
      // Una tienda cerrada o frenada no se ofrece; si ya la veía, vuelve sola al reabrir.
      if (storefrontHiddenReason({ ...sf, ownerActive: sf.retailerTenant.active }, now)) continue;
      if (sf.visibility === "PRIVATE" && r.source !== "INVITE" && r.status !== "ACCEPTED") continue;
      out.push({ ...(await this.publicProfile(sf)), audienceStatus: r.status, source: r.source, decidedAt: r.decidedAt?.toISOString() ?? null });
    }
    return out;
  }

  async decide(tenant: TenantContext, storefrontId: string, decision: "ACCEPT" | "DECLINE") {
    this.assertBuyer(tenant);
    assertPermission(tenant, "providers.manage");
    const buyerId = commercialId(tenant);
    const row = await this.prisma.storefrontAudience.findUnique({
      where: { storefrontId_buyerTenantId: { storefrontId, buyerTenantId: buyerId } },
      include: { storefront: { include: SF_INCLUDE } },
    });
    if (!row || row.status === "REMOVED") throw new NotFoundException("Esa tienda no está disponible para tu comercio");
    const sf = row.storefront;
    const key = sf.supplierTenant.providerKey;
    if (!key) throw new NotFoundException("Esa tienda no está disponible para tu comercio");
    if (decision === "ACCEPT" && (await this.visibility.platformHiddenFor(buyerId, tenant.userId)).has(key)) {
      throw new NotFoundException("Esa tienda no está disponible para tu comercio");
    }
    if (decision === "ACCEPT") {
      if (storefrontHiddenReason({ ...sf, ownerActive: sf.retailerTenant.active }, new Date())) {
        throw new BadRequestException("Esa tienda no está abierta ahora");
      }
      if (sf.visibility === "PRIVATE" && row.source !== "INVITE" && row.status !== "ACCEPTED") {
        throw new ForbiddenException("Esa tienda es privada: se entra con su link de invitación");
      }
    }
    const status: StorefrontAudienceStatus = decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
    await this.prisma.storefrontAudience.update({ where: { id: row.id }, data: { status, decidedAt: new Date() } });
    const ref = { supplierTenantId: sf.supplierTenantId, providerKey: key };
    if (decision === "ACCEPT") await this.connect(ref, buyerId);
    else await this.disconnect(ref, buyerId);
    return { storefrontId, provider: key, audienceStatus: status };
  }

  /** Una tienda que la plataforma oculta no se ve ni se acepta por link (la propia sí se ve). */
  private async assertNotPlatformHidden(tenant: TenantContext, sf: SfRow) {
    const buyerId = commercialId(tenant);
    if (sf.retailerTenantId === buyerId || sf.retailerTenantId === tenant.tenantId) return;
    const key = sf.supplierTenant.providerKey;
    if (key && (await this.visibility.platformHiddenFor(buyerId, tenant.userId)).has(key)) {
      throw new NotFoundException("El link de invitación no existe o ya no vale");
    }
  }

  private async byToken(token: string): Promise<SfRow> {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new NotFoundException("El link de invitación no existe o ya no vale");
    const sf = await this.prisma.storefront.findUnique({ where: { inviteToken: token }, include: SF_INCLUDE });
    if (!sf || !sf.supplierTenant.providerKey) throw new NotFoundException("El link de invitación no existe o ya no vale");
    return sf;
  }

  /** Lo que ve quien abre un link de invitación antes de aceptar. */
  async invitePreview(tenant: TenantContext, token: string) {
    const sf = await this.byToken(token);
    const buyerId = commercialId(tenant);
    await this.assertNotPlatformHidden(tenant, sf);
    const own = sf.retailerTenantId === buyerId || sf.retailerTenantId === tenant.tenantId;
    const row = own
      ? null
      : await this.prisma.storefrontAudience.findUnique({
          where: { storefrontId_buyerTenantId: { storefrontId: sf.id, buyerTenantId: buyerId } },
          select: { status: true },
        });
    const hidden = storefrontHiddenReason({ ...sf, ownerActive: sf.retailerTenant.active }, new Date());
    return {
      ...(await this.publicProfile(sf)),
      own,
      canAccept: !own && tenant.tenantType === "RETAILER",
      open: hidden == null,
      audienceStatus: row?.status ?? null,
    };
  }

  async acceptInvite(tenant: TenantContext, token: string) {
    this.assertBuyer(tenant);
    assertPermission(tenant, "providers.manage");
    const sf = await this.byToken(token);
    const buyerId = commercialId(tenant);
    if (sf.retailerTenantId === buyerId || sf.retailerTenantId === tenant.tenantId) {
      throw new BadRequestException("Es tu propia tienda");
    }
    await this.assertNotPlatformHidden(tenant, sf);
    if (storefrontHiddenReason({ ...sf, ownerActive: sf.retailerTenant.active }, new Date())) {
      throw new BadRequestException("Esa tienda no está abierta ahora. Probá más tarde.");
    }
    // El link lo dio la tienda: vale aunque antes la hubiera rechazado o lo hubieran sacado.
    await this.prisma.storefrontAudience.upsert({
      where: { storefrontId_buyerTenantId: { storefrontId: sf.id, buyerTenantId: buyerId } },
      create: { storefrontId: sf.id, buyerTenantId: buyerId, status: "ACCEPTED", source: "INVITE", decidedAt: new Date() },
      update: { status: "ACCEPTED", source: "INVITE", decidedAt: new Date() },
    });
    const key = sf.supplierTenant.providerKey!;
    await this.connect({ supplierTenantId: sf.supplierTenantId, providerKey: key }, buyerId);
    await this.prisma.orgNotification.create({
      data: {
        toTenantId: sf.retailerTenantId,
        fromTenantId: buyerId,
        kind: "SYSTEM",
        title: `${tenant.tenantName} entró a tu tienda con tu link`,
        body: "Ya ve tus productos en su buscador y te puede hacer pedidos.",
        landingKey: "storefront:audience",
      },
    });
    return { storefrontId: sf.id, provider: key, name: storefrontPublicName(sf, sf.retailerTenant.name) };
  }

  /**
   * Lo que el comprador ve de la tienda en la ficha de un producto: nombre,
   * condiciones, garantía, cómo está el stock y las fotos y el estado del producto.
   * Solo si ve esa tienda (o es la propia).
   */
  async itemInfo(tenant: TenantContext, provider: string, externalId: string) {
    const sf = await this.prisma.storefront.findFirst({
      where: { supplierTenant: { providerKey: provider } },
      include: SF_INCLUDE,
    });
    if (!sf) throw new NotFoundException("No es una tienda de NODO");
    const own = sf.retailerTenantId === tenant.tenantId || sf.retailerTenantId === commercialId(tenant);
    if (!own) {
      const visible = (await this.visibility.listFor(commercialId(tenant), tenant.userId)).some(
        (v) => v.provider === provider && v.storefront && v.linked
      );
      if (!visible) throw new NotFoundException("No es una tienda de NODO");
    }
    const [item, ficha] = await Promise.all([
      this.prisma.storefrontItem.findUnique({
        where: { storefrontId_externalId: { storefrontId: sf.id, externalId } },
        select: { images: true, condition: true },
      }),
      this.prisma.providerSyncCache.findUnique({
        where: { provider_externalId: { provider, externalId } },
        select: { warranty: true, imageUrl: true },
      }),
    ]);
    const images = item?.images.length ? item.images : ficha?.imageUrl ? [ficha.imageUrl] : [];
    return {
      store: await this.publicProfile(sf),
      item: {
        images,
        condition: item?.condition ?? null,
        warranty: ficha?.warranty ?? null,
      },
    };
  }

  /** La cara pública de la tienda. */
  async publicProfile(sf: SfRow) {
    const key = sf.supplierTenant.providerKey ?? "";
    const [productCount, categories] = await Promise.all([
      this.prisma.supplierBaseOffer.count({ where: { provider: key, OR: [{ stock: null }, { stock: { gt: 0 } }] } }),
      this.topCategories(key),
    ]);
    return {
      storefrontId: sf.id,
      provider: key,
      name: storefrontPublicName(sf, sf.retailerTenant.name),
      logoUrl: sf.logoUrl,
      about: sf.about,
      contactPhone: sf.contactPhone,
      contactNote: sf.contactNote,
      paymentMethods: sf.paymentMethods,
      deliveryOptions: sf.deliveryOptions,
      invoiceTypes: sf.invoiceTypes,
      defaultWarranty: sf.defaultWarranty,
      salesTerms: sf.salesTerms,
      sellsOffline: sf.sellsOffline,
      visibility: sf.visibility,
      stockConfirmedAt: sf.stockConfirmedAt?.toISOString() ?? null,
      stockValidDays: sf.stockValidDays,
      stockState: stockState(sf, new Date()),
      productCount,
      categories,
    };
  }

  private async topCategories(provider: string): Promise<string[]> {
    if (!provider) return [];
    const rows = await this.prisma.$queryRaw<{ category: string; n: bigint }[]>`
      SELECT f."category" AS category, COUNT(*) AS n
      FROM "SupplierBaseOffer" o
      JOIN "ProviderSyncCache" f ON f."provider" = o."provider" AND f."externalId" = o."externalId"
      WHERE o."provider" = ${provider} AND f."category" IS NOT NULL AND f."category" <> ''
      GROUP BY f."category" ORDER BY n DESC LIMIT 4`;
    return rows.map((r) => r.category);
  }

  // ---------- Lado tienda ----------

  /** Comercios que ven la tienda y cuántos tienen la propuesta pendiente o la rechazaron. */
  async audienceOf(storefrontId: string) {
    const rows = await this.prisma.storefrontAudience.findMany({
      where: { storefrontId },
      include: { buyerTenant: { select: { name: true, active: true } } },
      orderBy: [{ decidedAt: "desc" }, { createdAt: "desc" }],
    });
    const count = (s: StorefrontAudienceStatus) => rows.filter((r) => r.status === s).length;
    return {
      accepted: rows
        .filter((r) => r.status === "ACCEPTED" && r.buyerTenant.active)
        .map((r) => ({ tenantId: r.buyerTenantId, name: r.buyerTenant.name, source: r.source, since: (r.decidedAt ?? r.createdAt).toISOString() })),
      pending: count("PENDING"),
      declined: count("DECLINED"),
      removed: count("REMOVED"),
    };
  }

  /** La tienda saca a un comercio: deja de verla y no se le vuelve a ofrecer (sí puede volver con el link). */
  async removeBuyer(sf: { id: string; supplierTenantId: string; providerKey: string }, buyerTenantId: string) {
    const row = await this.prisma.storefrontAudience.findUnique({
      where: { storefrontId_buyerTenantId: { storefrontId: sf.id, buyerTenantId } },
    });
    if (!row || row.status !== "ACCEPTED") throw new NotFoundException("Ese comercio no ve tu tienda");
    await this.prisma.storefrontAudience.update({ where: { id: row.id }, data: { status: "REMOVED", decidedAt: new Date() } });
    await this.disconnect(sf, buyerTenantId);
    return { removed: true };
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
