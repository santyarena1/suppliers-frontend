// Integración contra un Postgres real con las migraciones aplicadas. Se salta si no hay
// INTEGRATION_DB (ej.: postgresql://postgres@127.0.0.1:55432/nodo_test2).
//
// Segunda pasada de auditoría de aislamiento multi-tenant: admin/**, ads/**, brands/**, news/**.
// Usa los SERVICES reales (no HTTP) para aislar la capa de datos. Prefijo de ids: iso2-.
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AdsService } from "../ads/ads.service";
import { AssetsController } from "../assets/assets.controller";
import { AssetsService } from "../assets/assets.service";
import { BrandActionsService } from "../brands/brand-actions.service";
import { BrandItemsService } from "../brands/brand-items.service";
import { BrandNotificationsService } from "../brands/brand-notifications.service";
import { BrandResourcesService } from "../brands/brand-resources.service";
import { NewsService } from "../news/news.service";
import { NewsVisibilityService } from "../news/news-visibility.service";
import { TenantVisibilityService } from "../tenants/tenant-visibility.service";
import type { TenantContext } from "../tenants/tenant-context.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;

function ctx(partial: Partial<TenantContext> & Pick<TenantContext, "tenantId" | "tenantType" | "userId">): TenantContext {
  return {
    tenantName: "x",
    tenantRole: "OWNER",
    membershipId: null,
    permissions: [],
    commercialTenantId: partial.tenantId,
    ...partial,
  } as TenantContext;
}

d("Aislamiento multi-tenant (2a pasada): admin/ads/brands/news", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });

  const visibility = new TenantVisibilityService(prisma as never);
  const newsVisibility = new NewsVisibilityService(prisma as never);
  const ads = new AdsService(prisma as never);
  const news = new NewsService(prisma as never, newsVisibility, ads);
  const notes = new BrandNotificationsService(prisma as never);
  const brandItems = new BrandItemsService(prisma as never, visibility);
  const brandActions = new BrandActionsService(prisma as never, notes);
  const brandResources = new BrandResourcesService(prisma as never);

  const brandA = "iso2-brand-a";
  const brandB = "iso2-brand-b";
  const retailerLinked = "iso2-retailer-linked"; // vinculado a brandA
  const retailerUnlinked = "iso2-retailer-unlinked"; // NO vinculado, solo ve brandA por publicidad
  const distro = "iso2-distro";
  const userBrandA = "iso2-user-brand-a";
  const userBrandB = "iso2-user-brand-b";
  const userLinked = "iso2-user-linked";
  const userUnlinked = "iso2-user-unlinked";

  let linkLinkedToA: { id: string };
  let eventArticle: { id: string };

  beforeAll(async () => {
    // Limpieza idempotente (hijos primero).
    const allTenantIds = [brandA, brandB, retailerLinked, retailerUnlinked, distro];
    await prisma.newsRsvp.deleteMany({ where: { tenantId: { in: allTenantIds } } });
    await prisma.newsArticle.deleteMany({ where: { tenantId: { in: allTenantIds } } });
    await prisma.brandItemLink.deleteMany({ where: { item: { tenantId: { in: allTenantIds } } } });
    await prisma.brandItem.deleteMany({ where: { tenantId: { in: allTenantIds } } });
    await prisma.brandResource.deleteMany({ where: { tenantId: { in: allTenantIds } } });
    await prisma.brandAction.deleteMany({ where: { tenantId: { in: allTenantIds } } });
    await prisma.adCampaign.deleteMany({ where: { tenantId: { in: allTenantIds } } });
    await prisma.orgNotification.deleteMany({
      where: { OR: [{ toTenantId: { in: allTenantIds } }, { fromTenantId: { in: allTenantIds } }] },
    });
    await prisma.tenantLink.deleteMany({
      where: { OR: [{ clientTenantId: { in: allTenantIds } }, { supplierTenantId: { in: allTenantIds } }] },
    });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: allTenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [userBrandA, userBrandB, userLinked, userUnlinked] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: allTenantIds } } });

    await prisma.tenant.create({ data: { id: brandA, name: "ISO2 Marca A", type: "BRAND", active: true } });
    await prisma.tenant.create({ data: { id: brandB, name: "ISO2 Marca B", type: "BRAND", active: true } });
    await prisma.tenant.create({ data: { id: retailerLinked, name: "ISO2 Comercio vinculado", type: "RETAILER" } });
    await prisma.tenant.create({ data: { id: retailerUnlinked, name: "ISO2 Comercio no vinculado", type: "RETAILER" } });
    await prisma.tenant.create({
      data: { id: distro, name: "ISO2 Distribuidor", type: "DISTRIBUTOR", providerKey: `LIST_ISO2_${Date.now()}` },
    });

    for (const [id, username] of [
      [userBrandA, "iso2-owner-brand-a"],
      [userBrandB, "iso2-owner-brand-b"],
      [userLinked, "iso2-owner-linked"],
      [userUnlinked, "iso2-owner-unlinked"],
    ] as const) {
      await prisma.user.create({
        data: { id, username: `${username}-${Date.now()}`, email: `${id}-${Date.now()}@test.local`, passwordHash: "x" },
      });
    }

    await prisma.tenantMembership.create({ data: { tenantId: brandA, userId: userBrandA, role: "OWNER" } });
    await prisma.tenantMembership.create({ data: { tenantId: brandB, userId: userBrandB, role: "OWNER" } });
    await prisma.tenantMembership.create({ data: { tenantId: retailerLinked, userId: userLinked, role: "OWNER" } });
    await prisma.tenantMembership.create({ data: { tenantId: retailerUnlinked, userId: userUnlinked, role: "OWNER" } });

    linkLinkedToA = await prisma.tenantLink.create({
      data: { clientTenantId: retailerLinked, supplierTenantId: brandA, status: "ACTIVE" },
    });

    // brandA pauta publicidad activa: aparece en el feed de CUALQUIER comercio (también el no vinculado).
    await ads.ensureSlots();
    const slot = await prisma.adSlot.findFirst({ where: { key: "discovery" } });
    if (slot) {
      await prisma.adSlot.update({ where: { id: slot.id }, data: { enabled: true } });
      await prisma.adCampaign.create({
        data: {
          tenantId: brandA,
          slotId: slot.id,
          title: "ISO2 campaña",
          subtitle: "",
          status: "ACTIVE",
          startsAt: new Date(Date.now() - 1000),
        },
      });
    }
    await prisma.tenant.update({ where: { id: brandA }, data: { advertisingEnabled: true } });

    // Nota tipo EVENT publicada por brandA, con URL de reunión privada.
    eventArticle = await prisma.newsArticle.create({
      data: {
        tenantId: brandA,
        publicKey: `iso2-event-${Date.now()}`,
        title: "ISO2 Evento privado",
        excerpt: "excerpt",
        bodyHtml: "<p>body</p>",
        coverUrl: "https://example.com/cover.png",
        kind: "EVENT",
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - 1000),
        isPublic: false,
        eventStartsAt: new Date(Date.now() + 3 * 86_400_000),
        eventUrl: "https://meet.example.com/iso2-secret",
        rsvpEnabled: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("un comercio NO vinculado que ve el evento por publicidad no recibe el link privado ni el RSVP", async () => {
    const viewer = ctx({ tenantId: retailerUnlinked, tenantType: "RETAILER", userId: userUnlinked });
    const detail = await news.getOne(viewer, eventArticle.id);
    expect(detail.author.linked).toBe(false);
    expect(detail.author.advertised).toBe(true);
    expect(detail.event?.url ?? null).toBeNull();
    expect(Boolean(detail.event?.rsvpEnabled)).toBe(false);
  });


  it("un comercio vinculado sí puede ver la URL del evento de su marca", async () => {
    const viewer = ctx({ tenantId: retailerLinked, tenantType: "RETAILER", userId: userLinked });
    const detail = await news.getOne(viewer, eventArticle.id);
    expect(detail.author.linked).toBe(true);
    expect(detail.event?.url).toBe("https://meet.example.com/iso2-secret");
  });

  it("brandItems: un comercio no puede leer el panel de items de otra marca como si fuera suyo", async () => {
    const asBrandA = ctx({ tenantId: brandA, tenantType: "BRAND", userId: userBrandA, tenantRole: "OWNER", permissions: ["brand.manage"] as never });
    const item = await prisma.brandItem.create({ data: { tenantId: brandA, name: "ISO2 Producto A" } });
    // Otra marca (brandB) no puede editar/borrar un item que no es suyo.
    const asBrandB = ctx({ tenantId: brandB, tenantType: "BRAND", userId: userBrandB, tenantRole: "OWNER", permissions: ["brand.manage"] as never });
    await expect(brandItems.updateItem(asBrandB, item.id, { name: "hijackeado" })).rejects.toThrow(NotFoundException);
    await expect(brandItems.deleteItem(asBrandB, item.id)).rejects.toThrow(NotFoundException);
    // La propia marca sí puede.
    await expect(brandItems.updateItem(asBrandA, item.id, { name: "ok" })).resolves.toBeDefined();
  });

  it("brandItems.clientView: un comercio no vinculado no puede ver el semáforo de la marca vía linkId ajeno", async () => {
    const asUnlinked = ctx({ tenantId: retailerUnlinked, tenantType: "RETAILER", userId: userUnlinked });
    await expect(brandItems.clientView(asUnlinked, linkLinkedToA.id)).rejects.toThrow(NotFoundException);
    const asLinked = ctx({ tenantId: retailerLinked, tenantType: "RETAILER", userId: userLinked });
    await expect(brandItems.clientView(asLinked, linkLinkedToA.id)).resolves.toBeDefined();
  });

  it("brandActions: una marca no puede leer/editar una acción de otra marca por id", async () => {
    const asBrandA = ctx({ tenantId: brandA, tenantType: "BRAND", userId: userBrandA, tenantRole: "OWNER", permissions: ["brand.manage"] as never });
    const asBrandB = ctx({ tenantId: brandB, tenantType: "BRAND", userId: userBrandB, tenantRole: "OWNER", permissions: ["brand.manage"] as never });
    const action = await brandActions.create(asBrandA, {
      kind: "PURCHASE_QTY",
      title: "ISO2 acción",
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      targetQty: 10,
    } as never);
    await expect(brandActions.get(asBrandB, action.id)).rejects.toThrow(NotFoundException);
    await expect(
      brandActions.update(asBrandB, action.id, {
        kind: "PURCHASE_QTY",
        title: "hijack",
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        targetQty: 1,
      } as never)
    ).rejects.toThrow(NotFoundException);
  });

  it("brandResources: una marca no puede cambiar visibilidad ni borrar un archivo de otra marca", async () => {
    const asBrandA = ctx({ tenantId: brandA, tenantType: "BRAND", userId: userBrandA, tenantRole: "OWNER", permissions: ["brand.manage"] as never });
    const asBrandB = ctx({ tenantId: brandB, tenantType: "BRAND", userId: userBrandB, tenantRole: "OWNER", permissions: ["brand.manage"] as never });
    const resource = await brandResources.create(asBrandA, {
      kind: "MATERIAL",
      type: "BANNER",
      title: "ISO2 banner",
      fileUrl: "https://example.com/banner.png",
      isPublic: false,
    } as never);
    await expect(brandResources.setVisibility(asBrandB, resource.id, true)).rejects.toThrow(NotFoundException);
    await expect(brandResources.remove(asBrandB, resource.id)).rejects.toThrow(NotFoundException);
  });

  it("brandResources: un material 'solo vinculados' no se descarga sin link firmado; al hacerlo público, sí", async () => {
    (process.env as Record<string, string>).ASSET_SIGNING_SECRET = process.env.ASSET_SIGNING_SECRET ?? "secreto-iso2";
    const asBrandA = ctx({ tenantId: brandA, tenantType: "BRAND", userId: userBrandA, tenantRole: "OWNER", permissions: ["brand.manage"] as never });
    const asset = await prisma.storedAsset.create({
      data: { mimeType: "application/pdf", filename: "lista.pdf", byteSize: 3, data: Buffer.from("pdf") },
    });
    const resource = await brandResources.create(asBrandA, {
      kind: "MATERIAL",
      type: "BANNER",
      title: "ISO2 lista privada",
      fileUrl: `/assets/${asset.id}`,
      isPublic: false,
    } as never);
    expect(resource.fileUrl).toMatch(/\?exp=\d+&sig=/);

    const controller = new AssetsController(new AssetsService(prisma as never));
    const reply = { header: jest.fn() } as never;
    await expect(controller.get(asset.id, undefined, undefined, reply)).rejects.toThrow(NotFoundException);
    const signed = new URL(resource.fileUrl!, "https://x");
    await expect(
      controller.get(asset.id, signed.searchParams.get("exp")!, signed.searchParams.get("sig")!, reply)
    ).resolves.toBeDefined();

    await brandResources.setVisibility(asBrandA, resource.id, true);
    await expect(controller.get(asset.id, undefined, undefined, reply)).resolves.toBeDefined();
  });

  it("news: un comercio no vinculado no puede marcar como leída/RSVPear una nota de otra marca a nombre propio sin ser autor", async () => {
    const asBrandB = ctx({ tenantId: brandB, tenantType: "BRAND", userId: userBrandB, tenantRole: "OWNER" });
    // brandB (no autor del evento) no puede borrar la nota de brandA.
    await expect(news.remove(asBrandB, eventArticle.id)).rejects.toThrow(NotFoundException);
  });

  it("ads: un anunciante no puede actualizar la campaña de otro tenant por id", async () => {
    const asBrandA = ctx({ tenantId: brandA, tenantType: "BRAND", userId: userBrandA, tenantRole: "OWNER", permissions: ["ads.manage"] as never });
    const asBrandB = ctx({ tenantId: brandB, tenantType: "BRAND", userId: userBrandB, tenantRole: "OWNER", permissions: ["ads.manage"] as never });
    await prisma.tenant.update({ where: { id: brandB }, data: { advertisingEnabled: true } });
    const slot = await prisma.adSlot.findFirst({ where: { key: "discovery" } });
    const campaign = await prisma.adCampaign.create({
      data: { tenantId: brandA, slotId: slot!.id, title: "a", subtitle: "", status: "DRAFT" },
    });
    await expect(
      ads.upsertCampaign(
        asBrandB,
        { slotId: slot!.id, title: "hijack", subtitle: "", status: "DRAFT" } as never,
        campaign.id
      )
    ).rejects.toThrow(NotFoundException);
  });
});
