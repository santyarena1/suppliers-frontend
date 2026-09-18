import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Prisma, type TenantRole as PrismaTenantRole } from "@prisma/client";
import {
  TENANT_PLAN_DESCRIPTIONS,
  TENANT_PLAN_LABELS,
  TENANT_ROLE_LABELS,
  type TenantPlan,
  type TenantRole,
  type TenantType,
} from "@nodo/shared";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContextService } from "../tenants/tenant-context.service";
import { DEMO_DISTRIBUTORS, DEMO_PRODUCTS, DEMO_SEARCH_HINTS } from "./onboarding-demo";
import { BootstrapRetailerOrgDto } from "./dto/onboarding.dto";
import { RETAILER_ONBOARDING_STEPS, type OnboardingStep } from "./onboarding-steps";

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly tenantContext: TenantContextService
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        onboardingCompletedAt: true,
        onboardingPreviewRestoreTenantId: true,
        onboardingReplay: true,
      },
    });
    const tenant = await this.tenantContext.forUser(userId);
    const preview = Boolean(user.onboardingPreviewRestoreTenantId);
    const mode = this.resolveMode(user, tenant, preview);
    const needsOnboarding = this.needsOnboarding(user, tenant, preview);
    const steps = this.stepsFor({
      type: tenant?.tenantType ?? null,
      role: tenant?.tenantRole ?? null,
      hasTenant: Boolean(tenant),
      mode,
    });

    let demo: {
      seeded: boolean;
      distributors: { name: string; providerKey: string }[];
      productCount: number;
      searchHints: string[];
    } | null = null;

    if (tenant?.tenantType === "RETAILER") {
      const org = await this.prisma.tenant.findUnique({
        where: { id: tenant.tenantId },
        select: { demoSeededAt: true, plan: true },
      });
      const productCount = await this.prisma.tenantProductOffer.count({
        where: {
          tenantId: tenant.tenantId,
          provider: { in: DEMO_DISTRIBUTORS.map((d) => d.providerKey) },
          active: true,
        },
      });
      demo = {
        seeded: Boolean(org?.demoSeededAt) || productCount > 0,
        distributors: DEMO_DISTRIBUTORS.map((d) => ({ name: d.name, providerKey: d.providerKey })),
        productCount,
        searchHints: [...DEMO_SEARCH_HINTS],
      };
    }

    const plan = tenant
      ? await this.prisma.tenant.findUnique({
          where: { id: tenant.tenantId },
          select: { plan: true },
        })
      : null;

    return {
      needsOnboarding,
      completed: Boolean(user.onboardingCompletedAt) && !preview,
      completedAt: user.onboardingCompletedAt?.toISOString() ?? null,
      hasTenant: Boolean(tenant),
      mode,
      preview,
      tenant: tenant
        ? {
            id: tenant.tenantId,
            name: tenant.tenantName,
            type: tenant.tenantType,
            role: tenant.tenantRole,
            plan: (plan?.plan ?? "PRO") as TenantPlan,
            planLabel: TENANT_PLAN_LABELS[(plan?.plan ?? "PRO") as TenantPlan],
            planDescription: TENANT_PLAN_DESCRIPTIONS[(plan?.plan ?? "PRO") as TenantPlan],
          }
        : null,
      roleLabel: tenant ? TENANT_ROLE_LABELS[tenant.tenantRole] : null,
      steps,
      demo,
      canBootstrap:
        !tenant && (user.role === "ROLE_USER" || (user.role === "ROLE_ADMIN" && preview)),
      canStartTour: Boolean(tenant?.tenantType === "RETAILER") || preview,
    };
  }

  /**
   * Alta self-serve de un comercio (tipo 1). También sirve al superadmin en
   * modo preview (sin membresía activa, con restore guardado).
   */
  async bootstrapRetailer(userId: string, dto: BootstrapRetailerOrgDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const preview = Boolean(user.onboardingPreviewRestoreTenantId);
    if (user.role === "ROLE_ADMIN" && !preview) {
      throw new ForbiddenException(
        "Para probar el onboarding como superadmin, iniciá el preview desde la landing"
      );
    }
    const existing = await this.tenantContext.forUser(userId);
    if (existing) {
      throw new ConflictException("Ya pertenecés a una organización");
    }

    const name = dto.name.trim().replace(/\s+/g, " ");
    if (name.length < 2) throw new BadRequestException("El nombre del comercio es obligatorio");

    const taken = await this.prisma.tenant.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (taken) throw new ConflictException("Ya existe una organización con ese nombre");

    const tenant = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name,
          type: "RETAILER",
          plan: "PRO",
          contactEmail: dto.contactEmail?.trim() || user.email,
          contactPhone: dto.contactPhone?.trim() || null,
          notes: preview ? "Comercio de preview del onboarding (superadmin)" : null,
          managedByPlatform: preview,
        },
      });
      await tx.tenantMembership.create({
        data: {
          tenantId: created.id,
          userId,
          role: "OWNER",
          title: preview ? "Preview onboarding" : "Dueño del local",
        },
      });
      return created;
    });

    await this.seedDemoSandbox(tenant.id, userId);

    const { token } = await this.auth.issueTokenForUserId(userId);
    const status = await this.status(userId);
    return {
      token,
      org: {
        id: tenant.id,
        name: tenant.name,
        type: tenant.type as TenantType,
        plan: tenant.plan as TenantPlan,
        planLabel: TENANT_PLAN_LABELS[tenant.plan as TenantPlan],
      },
      onboarding: status,
    };
  }

  /**
   * Comercio ya existente: reabre el recorrido saltando el alta (org/plan) y
   * asegura el catálogo demo para poder probar filtros y pedidos.
   */
  async startTour(userId: string) {
    const tenant = await this.tenantContext.forUser(userId);
    if (!tenant || tenant.tenantType !== "RETAILER") {
      throw new ForbiddenException("El recorrido guiado es para comercios");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: null, onboardingReplay: true },
    });
    if (tenant.tenantRole === "OWNER" || tenant.tenantRole === "ADMIN") {
      await this.seedDemoSandbox(tenant.tenantId, userId);
    }
    return this.status(userId);
  }

  /**
   * Superadmin desde la landing: guarda Administración, suelta la membresía y
   * deja al usuario sin org para hacer el onboarding desde cero.
   */
  async enterPreview(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role !== "ROLE_ADMIN") {
      throw new ForbiddenException("Solo el administrador de plataforma puede abrir el preview");
    }

    // Si ya estaba en preview a medias, restaurar antes de reiniciar.
    if (user.onboardingPreviewRestoreTenantId) {
      await this.exitPreview(userId, { markComplete: false });
    }

    const current = await this.prisma.tenantMembership.findFirst({
      where: { userId, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!current) {
      throw new BadRequestException("El superadmin no tiene organización a la que volver");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          onboardingCompletedAt: null,
          onboardingReplay: false,
          onboardingPreviewRestoreTenantId: current.tenantId,
          onboardingPreviewRestoreRole: current.role,
        },
      });
      await tx.tenantMembership.update({
        where: { id: current.id },
        data: { active: false },
      });
      // Por si quedó una membresía de un preview anterior.
      await tx.tenantMembership.updateMany({
        where: {
          userId,
          active: true,
          tenant: { managedByPlatform: true, type: "RETAILER", notes: { contains: "preview" } },
        },
        data: { active: false },
      });
    });

    const { token } = await this.auth.issueTokenForUserId(userId);
    return { token, onboarding: await this.status(userId) };
  }

  /** Sale del preview y restaura la membresía de Administración. */
  async exitPreview(userId: string, opts: { markComplete?: boolean } = {}) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const restoreId = user.onboardingPreviewRestoreTenantId;
    if (!restoreId) {
      const { token } = await this.auth.issueTokenForUserId(userId);
      return { token, onboarding: await this.status(userId) };
    }
    const restoreRole = (user.onboardingPreviewRestoreRole ?? "OWNER") as PrismaTenantRole;

    await this.prisma.$transaction(async (tx) => {
      const previewMemberships = await tx.tenantMembership.findMany({
        where: { userId, tenantId: { not: restoreId } },
        include: { tenant: { select: { id: true, managedByPlatform: true, notes: true, type: true } } },
      });
      for (const membership of previewMemberships) {
        const isPreview =
          membership.tenant.managedByPlatform &&
          membership.tenant.type === "RETAILER" &&
          (membership.tenant.notes ?? "").toLowerCase().includes("preview");
        if (isPreview) {
          await tx.tenantMembership.delete({ where: { id: membership.id } });
        } else if (membership.active) {
          await tx.tenantMembership.update({ where: { id: membership.id }, data: { active: false } });
        }
      }

      const restore = await tx.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: restoreId, userId } },
      });
      if (restore) {
        await tx.tenantMembership.update({
          where: { id: restore.id },
          data: { active: true, role: restoreRole },
        });
      } else {
        await tx.tenantMembership.create({
          data: { tenantId: restoreId, userId, role: restoreRole, title: "Administración" },
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          onboardingPreviewRestoreTenantId: null,
          onboardingPreviewRestoreRole: null,
          onboardingReplay: false,
          onboardingCompletedAt: opts.markComplete === false ? null : new Date(),
        },
      });
    });

    const { token } = await this.auth.issueTokenForUserId(userId);
    return { token, onboarding: await this.status(userId) };
  }

  async complete(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { onboardingPreviewRestoreTenantId: true },
    });
    if (user.onboardingPreviewRestoreTenantId) {
      return this.exitPreview(userId, { markComplete: true });
    }
    const tenant = await this.tenantContext.forUser(userId);
    if (!tenant) {
      throw new BadRequestException("Creá tu organización antes de cerrar el recorrido");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: new Date(), onboardingReplay: false },
    });
    const { token } = await this.auth.issueTokenForUserId(userId);
    return { token, onboarding: await this.status(userId) };
  }

  async reopen(userId: string) {
    return this.startTour(userId);
  }

  async reseedDemo(userId: string) {
    const tenant = await this.tenantContext.forUser(userId);
    if (!tenant || tenant.tenantType !== "RETAILER") {
      throw new ForbiddenException("Solo un comercio puede cargar el catálogo de demostración");
    }
    if (tenant.tenantRole !== "OWNER" && tenant.tenantRole !== "ADMIN") {
      throw new ForbiddenException("Solo el dueño o un administrador pueden regenerar los datos demo");
    }
    await this.seedDemoSandbox(tenant.tenantId, userId);
    return this.status(userId);
  }

  async seedDemoSandbox(retailerTenantId: string, actorUserId: string) {
    const distributors = [];
    for (const demo of DEMO_DISTRIBUTORS) {
      let distro = await this.prisma.tenant.findUnique({
        where: { providerKey: demo.providerKey },
      });
      if (!distro) {
        distro = await this.prisma.tenant.create({
          data: {
            name: demo.name,
            type: "DISTRIBUTOR",
            providerKey: demo.providerKey,
            contactEmail: demo.contactEmail,
            managedByPlatform: true,
            notes: "Distribuidor de demostración para onboarding de comercios",
            plan: "PRO",
          },
        });
      }
      distributors.push(distro);

      await this.prisma.tenantLink.upsert({
        where: {
          clientTenantId_supplierTenantId: {
            clientTenantId: retailerTenantId,
            supplierTenantId: distro.id,
          },
        },
        create: {
          clientTenantId: retailerTenantId,
          supplierTenantId: distro.id,
          status: "ACTIVE",
          notes: "Vínculo de demostración",
          discountPercent: new Prisma.Decimal(2),
        },
        update: { status: "ACTIVE" },
      });

      await this.prisma.providerSyncConfig.upsert({
        where: {
          tenantId_provider: { tenantId: retailerTenantId, provider: demo.providerKey },
        },
        create: {
          tenantId: retailerTenantId,
          provider: demo.providerKey,
          enabled: false,
          priceChannel: "LIST",
          acceptsOffline: true,
          acceptsScheme: false,
          offlineIvaAdjustment: "REMOVE",
          manualIibbPercent: new Prisma.Decimal(0),
        },
        update: {
          priceChannel: "LIST",
          acceptsOffline: true,
          offlineIvaAdjustment: "REMOVE",
        },
      });
    }

    for (const product of DEMO_PRODUCTS) {
      await this.prisma.providerSyncCache.upsert({
        where: {
          provider_externalId: { provider: product.provider, externalId: product.externalId },
        },
        create: {
          provider: product.provider,
          externalId: product.externalId,
          sku: product.sku,
          name: product.name,
          brand: product.brand,
          category: product.category,
          subcategory: product.subcategory,
          description: product.description,
          raw: { demo: true, sku: product.sku, brand: product.brand },
        },
        update: {
          sku: product.sku,
          name: product.name,
          brand: product.brand,
          category: product.category,
          subcategory: product.subcategory,
          description: product.description,
        },
      });

      await this.prisma.tenantProductOffer.upsert({
        where: {
          tenantId_provider_externalId: {
            tenantId: retailerTenantId,
            provider: product.provider,
            externalId: product.externalId,
          },
        },
        create: {
          tenantId: retailerTenantId,
          provider: product.provider,
          externalId: product.externalId,
          price: new Prisma.Decimal(product.price),
          finalPrice: new Prisma.Decimal(product.finalPrice),
          currency: product.currency,
          ivaPercent: new Prisma.Decimal(product.ivaPercent),
          stock: product.stock,
          stockStatus: "IN_STOCK",
          active: true,
          source: "BASE_LIST",
          needsResync: false,
        },
        update: {
          price: new Prisma.Decimal(product.price),
          finalPrice: new Prisma.Decimal(product.finalPrice),
          currency: product.currency,
          ivaPercent: new Prisma.Decimal(product.ivaPercent),
          stock: product.stock,
          stockStatus: "IN_STOCK",
          active: true,
          source: "BASE_LIST",
        },
      });
    }

    const existingDemoOrders = await this.prisma.providerOrder.count({
      where: { tenantId: retailerTenantId, notes: { contains: "[DEMO]" } },
    });

    if (existingDemoOrders === 0) {
      const mouse = DEMO_PRODUCTS[0];
      const ssd = DEMO_PRODUCTS[3];
      for (const [product, qty, note] of [
        [mouse, 1, "[DEMO] Pedido de ejemplo — Distribuidora Demo Norte"],
        [ssd, 2, "[DEMO] Pedido de ejemplo — Distribuidora Demo Sur"],
      ] as const) {
        await this.prisma.providerOrder.create({
          data: {
            userId: actorUserId,
            tenantId: retailerTenantId,
            createdByUserId: actorUserId,
            approvedByUserId: actorUserId,
            approvalDecidedAt: new Date(),
            provider: product.provider,
            channel: "OFFLINE",
            status: "OFFLINE",
            approvalStatus: "NOT_REQUIRED",
            paymentOption: "OFFLINE",
            notes: note,
            subtotal: new Prisma.Decimal(product.price * qty),
            impuestos: new Prisma.Decimal(0),
            percepciones: new Prisma.Decimal(0),
            total: new Prisma.Decimal(product.price * qty),
            items: [
              {
                externalId: product.externalId,
                sku: product.sku,
                name: product.name,
                quantity: qty,
                unitPrice: product.price,
                ivaPercent: product.ivaPercent,
                pricingMode: "offline",
              },
            ],
            addressSnapshot: {},
            draftInput: { demo: true },
          },
        });
      }
    }

    await this.prisma.tenant.update({
      where: { id: retailerTenantId },
      data: { demoSeededAt: new Date() },
    });

    return { distributors: distributors.map((d) => ({ id: d.id, name: d.name, providerKey: d.providerKey })) };
  }

  private resolveMode(
    user: {
      role: string;
      onboardingCompletedAt: Date | null;
      onboardingReplay?: boolean;
    },
    tenant: Awaited<ReturnType<TenantContextService["forUser"]>>,
    preview: boolean
  ): "fresh" | "existing" | "preview" {
    if (preview) return "preview";
    if (!tenant) return "fresh";
    if (tenant.tenantType !== "RETAILER") return "existing";
    if (user.onboardingReplay || user.onboardingCompletedAt) return "existing";
    return "fresh";
  }

  private needsOnboarding(
    user: {
      role: string;
      onboardingCompletedAt: Date | null;
      onboardingReplay?: boolean;
      onboardingPreviewRestoreTenantId?: string | null;
    },
    tenant: Awaited<ReturnType<TenantContextService["forUser"]>>,
    preview: boolean
  ): boolean {
    if (preview) return true;
    if (user.onboardingReplay) return true;
    if (user.role === "ROLE_ADMIN") return false;
    if (!tenant) return true;
    if (tenant.tenantType !== "RETAILER") return false;
    return !user.onboardingCompletedAt;
  }

  private stepsFor(opts: {
    type: TenantType | null;
    role: TenantRole | null;
    hasTenant: boolean;
    mode: "fresh" | "existing" | "preview";
  }): OnboardingStep[] {
    if (opts.type && opts.type !== "RETAILER" && opts.mode !== "preview") return [];
    return RETAILER_ONBOARDING_STEPS.filter((step) => {
      if (opts.mode === "existing" && step.skipIfExisting) return false;
      if (step.id === "org" && opts.hasTenant) return false;
      if (!opts.hasTenant) return step.id === "org";
      if (step.requiresTenant && !opts.hasTenant) return false;
      if (step.roles && opts.role && !step.roles.includes(opts.role)) return false;
      return true;
    });
  }
}
