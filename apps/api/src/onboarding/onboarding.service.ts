import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
} from "@nestjs/common";
import { InboxService } from "../inbox/inbox.service";
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
import { pickRealDemo, type RealDemo } from "./onboarding-demo-real";
import * as argon2 from "argon2";
import { generatePassword } from "../common/generate-password";
import { initialSubscription, type InitialSubscriptionInput } from "../subscriptions/subscription-init";
import { AdminCreateRetailerDto, BootstrapRetailerOrgDto } from "./dto/onboarding.dto";
import { RETAILER_ONBOARDING_STEPS, type OnboardingStep } from "./onboarding-steps";
import {
  ORDER_DAYS,
  buildDemoOrders,
  buildDemoPriceHistory,
  resolveTourHref,
  type DemoHistoryProduct,
} from "./onboarding-demo-history";
import { getPlanCapabilities, isTenantPlan } from "@nodo/shared";

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly inbox?: InboxService
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
        onboardingStep: true,
      },
    });
    const tenant = await this.tenantContext.forUser(userId);
    const preview = Boolean(user.onboardingPreviewRestoreTenantId);
    const mode = this.resolveMode(user, tenant, preview);
    const needsOnboarding = this.needsOnboarding(user, tenant, preview);
    const planRow = tenant
      ? await this.prisma.tenant.findUnique({ where: { id: tenant.tenantId }, select: { plan: true } })
      : null;
    const steps = this.stepsFor({
      type: tenant?.tenantType ?? null,
      role: tenant?.tenantRole ?? null,
      hasTenant: Boolean(tenant),
      mode,
      plan: planRow?.plan ?? null,
    });

    let demoQuery: string | null = null;
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
      demoQuery = await this.demoSearchQuery(tenant.tenantId);
      demo = {
        seeded: Boolean(org?.demoSeededAt) || productCount > 0,
        distributors: DEMO_DISTRIBUTORS.map((d) => ({ name: d.name, providerKey: d.providerKey })),
        productCount,
        searchHints: demoQuery ? [demoQuery] : [...DEMO_SEARCH_HINTS],
      };
    }

    // Los pasos apuntan a lo que hay en la demo de este comercio.
    const demoProduct = tenant?.tenantType === "RETAILER" ? await this.demoProductPath(tenant.tenantId, demoQuery) : null;
    const tourSteps = steps.map((step) => ({
      ...step,
      href: resolveTourHref(step.href, {
        search: demoQuery,
        product: demoProduct,
        provider: DEMO_DISTRIBUTORS[0].providerKey,
      }),
    }));

    const plan = planRow;

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
      steps: tourSteps,
      /** Paso en el que quedó; si el guardado ya no aplica a su recorrido, el primero. */
      currentStep: steps.find((step) => step.id === user.onboardingStep)?.id ?? steps[0]?.id ?? null,
      demo,
      canBootstrap:
        !tenant && (user.role === "ROLE_USER" || (user.role === "ROLE_ADMIN" && preview)),
      canStartTour: Boolean(tenant?.tenantType === "RETAILER") || preview,
    };
  }

  /** Guarda en qué paso va. La app lo lee de acá: no hay otra fuente de verdad. */
  async setStep(userId: string, stepId: string) {
    const status = await this.status(userId);
    if (!status.steps.some((step) => step.id === stepId)) {
      throw new BadRequestException("Ese paso no es parte de tu recorrido");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { onboardingStep: stepId } });
    return { currentStep: stepId };
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

    // Self-serve arranca con prueba en el plan que eligió en la landing (Base
    // si no eligió). El preview del superadmin no cobra ni corta nada: Pro en
    // cortesía, para poder recorrer todo.
    const plan: TenantPlan = preview ? "PRO" : (dto.trialPlan ?? "BASE");
    const subscription: InitialSubscriptionInput = preview
      ? { plan, mode: "COURTESY", courtesyReason: "Preview del onboarding (superadmin)" }
      : { plan, mode: "TRIAL" };
    const tenant = await this.prisma.$transaction(async (tx) => {
      // Doble click o dos pestañas: el segundo espera al primero y ve que ya tiene organización.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`onboarding:${userId}`}))`;
      const already = await tx.tenantMembership.findFirst({
        where: { userId, active: true, tenant: { active: true } },
        select: { id: true },
      });
      if (already) throw new ConflictException("Ya pertenecés a una organización");
      const created = await tx.tenant.create({
        data: {
          name,
          type: "RETAILER",
          plan,
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
      await createSubscription(tx, created.id, subscription, userId);
      return created;
    });

    await this.seedDemoSandbox(tenant.id, userId);

    if (!preview) {
      void this.inbox?.record({
        type: "NEW_STORE",
        title: `Nuevo comercio: ${tenant.name}`,
        company: tenant.name,
        contactName: user.username,
        contactEmail: tenant.contactEmail ?? user.email,
        contactPhone: tenant.contactPhone,
        tenantId: tenant.id,
        userId,
        data: { Plan: TENANT_PLAN_LABELS[plan], Estado: "Prueba gratis de 14 días" },
      });
    }

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
   * Superadmin da de alta un comercio con su dueño: catálogo demo, y el recorrido
   * guiado arranca solo la primera vez que el dueño entra (onboardingCompletedAt
   * queda en null). Plan y modalidad los elige Administración (por defecto Pro
   * activo con primer cobro en un mes).
   */
  async createRetailerForAdmin(dto: AdminCreateRetailerDto) {
    const name = dto.name.trim().replace(/\s+/g, " ");
    const username = dto.ownerUsername.trim();
    const email = dto.ownerEmail.trim().toLowerCase();

    const taken = await this.prisma.tenant.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (taken) throw new ConflictException("Ya existe una organización con ese nombre");
    const clash = await this.prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
    if (clash) {
      throw new ConflictException(clash.username === username ? "El nombre de usuario ya está en uso" : "El email ya está registrado");
    }

    const password = dto.ownerPassword ?? generatePassword();
    const passwordHash = await argon2.hash(password);
    const plan: TenantPlan = dto.plan ?? "PRO";
    const subscription: InitialSubscriptionInput = {
      plan,
      mode: dto.billing ?? "ACTIVE",
      firstBillingAt: dto.firstBillingAt ? new Date(dto.firstBillingAt) : null,
      courtesyUntil: dto.courtesyUntil ? new Date(dto.courtesyUntil) : null,
      courtesyReason: dto.courtesyReason ?? null,
    };
    const { tenant, owner } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          type: "RETAILER",
          plan,
          contactEmail: dto.contactEmail?.trim() || email,
          contactPhone: dto.contactPhone?.trim() || null,
        },
      });
      const owner = await tx.user.create({
        data: { username, email, passwordHash, role: "ROLE_USER", emailVerifiedAt: new Date() },
      });
      await tx.tenantMembership.create({
        data: { tenantId: tenant.id, userId: owner.id, role: "OWNER", title: "Dueño del local" },
      });
      await createSubscription(tx, tenant.id, subscription, null);
      return { tenant, owner };
    });

    await this.seedDemoSandbox(tenant.id, owner.id);

    return {
      tenant: { id: tenant.id, name: tenant.name, type: tenant.type as TenantType, plan: tenant.plan as TenantPlan },
      owner: { id: owner.id, username: owner.username, email: owner.email },
      ...(dto.ownerPassword ? {} : { generatedPassword: password }),
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
      data: { onboardingCompletedAt: null, onboardingReplay: true, onboardingStep: null },
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
      data: { onboardingCompletedAt: new Date(), onboardingReplay: false, onboardingStep: null },
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
          // Solo las ofertas de esta demo: no fichas sueltas de demos de otros comercios.
          hideUnsyncedCatalog: true,
          offlineIvaAdjustment: "REMOVE",
          manualIibbPercent: new Prisma.Decimal(0),
        },
        update: {
          priceChannel: "LIST",
          hideUnsyncedCatalog: true,
          acceptsOffline: true,
          offlineIvaAdjustment: "REMOVE",
        },
      });
    }

    const real = await this.loadRealDemo();
    const products = real?.products ?? DEMO_PRODUCTS;
    // Lo que quedó de una demo anterior (otra selección) deja de verse.
    await this.prisma.tenantProductOffer.updateMany({
      where: {
        tenantId: retailerTenantId,
        provider: { in: DEMO_DISTRIBUTORS.map((d) => d.providerKey) },
        externalId: { notIn: products.map((p) => p.externalId) },
      },
      data: { active: false },
    });

    for (const product of products) {
      await this.prisma.providerSyncCache.upsert({
        where: {
          provider_externalId: { provider: product.provider, externalId: product.externalId },
        },
        create: {
          provider: product.provider,
          externalId: product.externalId,
          sku: product.sku,
          partNumber: product.partNumber,
          ean: product.ean,
          name: product.name,
          brand: product.brand,
          category: product.category,
          subcategory: product.subcategory,
          description: product.description,
          longDescription: product.longDescription,
          imageUrl: product.imageUrl,
          warranty: product.warranty,
          raw: {
            demo: true,
            sku: product.sku,
            brand: product.brand,
            partNumber: product.partNumber,
            ean: product.ean,
          },
        },
        update: {
          sku: product.sku,
          partNumber: product.partNumber,
          ean: product.ean,
          name: product.name,
          brand: product.brand,
          category: product.category,
          subcategory: product.subcategory,
          description: product.description,
          longDescription: product.longDescription,
          imageUrl: product.imageUrl,
          warranty: product.warranty,
          raw: {
            demo: true,
            sku: product.sku,
            brand: product.brand,
            partNumber: product.partNumber,
            ean: product.ean,
          },
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

    const history: DemoHistoryProduct[] = products.map((p) => ({
      provider: p.provider,
      externalId: p.externalId,
      sku: p.sku,
      name: p.name,
      price: p.price,
      finalPrice: p.finalPrice,
      ivaPercent: p.ivaPercent,
    }));
    await this.seedDemoOrders(retailerTenantId, actorUserId, history);
    await this.seedDemoPriceDrops(retailerTenantId, history);

    await this.prisma.tenant.update({
      where: { id: retailerTenantId },
      data: { demoSeededAt: new Date() },
    });

    return { distributors: distributors.map((d) => ({ id: d.id, name: d.name, providerKey: d.providerKey })) };
  }

  /**
   * Pedidos de los últimos meses (online con número del distribuidor, y offline)
   * para que pedidos, factura y estadísticas tengan contenido. Si faltan (demo
   * vieja con solo dos offline), se regeneran; los de la persona no se tocan.
   */
  private async seedDemoOrders(retailerTenantId: string, actorUserId: string, products: DemoHistoryProduct[]) {
    const demoWhere = {
      tenantId: retailerTenantId,
      provider: { in: DEMO_DISTRIBUTORS.map((d) => d.providerKey) },
      notes: { contains: "[DEMO]" },
    };
    const [existing, online] = await Promise.all([
      this.prisma.providerOrder.count({ where: demoWhere }),
      this.prisma.providerOrder.count({ where: { ...demoWhere, channel: "ONLINE" } }),
    ]);
    if (existing >= ORDER_DAYS.length && online > 0) return;
    await this.prisma.providerOrder.deleteMany({ where: demoWhere });
    const orders = buildDemoOrders(products);
    if (orders.length === 0) return;
    await this.prisma.providerOrder.createMany({
      data: orders.map((order) => ({
        userId: actorUserId,
        tenantId: retailerTenantId,
        createdByUserId: actorUserId,
        approvedByUserId: actorUserId,
        approvalDecidedAt: order.createdAt,
        provider: order.provider,
        channel: order.channel,
        status: order.status,
        approvalStatus: "NOT_REQUIRED" as const,
        invidOrderNumber: order.orderNumber,
        paymentOption: order.paymentOption,
        paymentLabel: order.paymentLabel,
        deliveryLabel: order.deliveryLabel,
        notes: order.notes,
        subtotal: new Prisma.Decimal(order.subtotal),
        impuestos: new Prisma.Decimal(order.impuestos),
        percepciones: new Prisma.Decimal(0),
        total: new Prisma.Decimal(order.total),
        items: order.items as Prisma.InputJsonValue,
        addressSnapshot: {},
        draftInput: { demo: true },
        createdAt: order.createdAt,
      })),
    });
  }

  /** Historial de precios con bajas recientes, para "Bajaron de precio". Solo de este comercio. */
  private async seedDemoPriceDrops(retailerTenantId: string, products: DemoHistoryProduct[]) {
    const points = buildDemoPriceHistory(products);
    await this.prisma.productPriceHistory.deleteMany({
      where: { tenantId: retailerTenantId, provider: { in: DEMO_DISTRIBUTORS.map((d) => d.providerKey) } },
    });
    if (points.length === 0) return;
    await this.prisma.productPriceHistory.createMany({
      data: points.map((p) => ({
        tenantId: retailerTenantId,
        provider: p.provider,
        externalId: p.externalId,
        price: new Prisma.Decimal(p.price),
        finalPrice: p.finalPrice == null ? null : new Prisma.Decimal(p.finalPrice),
        currency: "USD",
        capturedAt: p.capturedAt,
      })),
    });
  }

  /** `PROVEEDOR/externalId` de un producto demo para abrir su ficha en el recorrido. */
  private async demoProductPath(tenantId: string, brand: string | null): Promise<string | null> {
    try {
      const offer = await this.prisma.tenantProductOffer.findFirst({
        where: {
          tenantId,
          active: true,
          provider: { in: DEMO_DISTRIBUTORS.map((d) => d.providerKey) },
          ...(brand ? { product: { brand: { equals: brand, mode: "insensitive" as const } } } : {}),
        },
        orderBy: { stock: "desc" },
        select: { provider: true, externalId: true },
      });
      return offer ? `${offer.provider}/${encodeURIComponent(offer.externalId)}` : null;
    } catch {
      return null;
    }
  }

  /** Marca de un producto de la demo que está en los dos distribuidores demo. */
  private async demoSearchQuery(tenantId: string): Promise<string | null> {
    try {
      const offers = await this.prisma.tenantProductOffer.findMany({
        where: { tenantId, active: true, provider: { in: DEMO_DISTRIBUTORS.map((d) => d.providerKey) } },
        select: { provider: true, product: { select: { brand: true } } },
      });
      // Cada distribuidor escribe la marca a su manera ("LEXAR" / "Lexar").
      const byBrand = new Map<string, { label: string; providers: Set<string> }>();
      for (const offer of offers) {
        const label = offer.product.brand?.trim();
        if (!label) continue;
        const key = label.toLowerCase();
        const entry = byBrand.get(key) ?? { label, providers: new Set<string>() };
        entry.providers.add(offer.provider);
        byBrand.set(key, entry);
      }
      for (const entry of byBrand.values()) if (entry.providers.size > 1) return entry.label;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Catálogo real para la demo: las ofertas del comercio espejo del superadmin
   * (el que tiene las credenciales reales de los distribuidores). Si no hay o no
   * alcanza, `null` y se usa la demo fija.
   */
  private async loadRealDemo(): Promise<RealDemo | null> {
    try {
      const admin = await this.prisma.tenantMembership.findFirst({
        where: { active: true, user: { role: "ROLE_ADMIN", active: true }, tenant: { active: true } },
        orderBy: { createdAt: "asc" },
        select: { tenant: { select: { id: true, mirrorsCommercialFromId: true } } },
      });
      if (!admin) return null;
      const sourceTenantId = admin.tenant.mirrorsCommercialFromId ?? admin.tenant.id;
      const offers = await this.prisma.tenantProductOffer.findMany({
        where: {
          tenantId: sourceTenantId,
          active: true,
          stock: { gt: 0 },
          price: { gt: 0 },
          provider: { notIn: DEMO_DISTRIBUTORS.map((d) => d.providerKey) },
          product: { imageUrl: { not: null } },
        },
        include: { product: true },
        orderBy: { stock: "desc" },
        take: 4000,
      });
      return pickRealDemo(
        offers.map((o) => ({
          provider: o.provider,
          externalId: o.externalId,
          sku: o.product.sku,
          partNumber: o.product.partNumber,
          ean: o.product.ean,
          name: o.product.name,
          brand: o.product.brand,
          category: o.product.category,
          subcategory: o.product.subcategory,
          description: o.product.description,
          longDescription: o.product.longDescription,
          imageUrl: o.product.imageUrl,
          warranty: o.product.warranty,
          price: Number(o.price),
          finalPrice: o.finalPrice === null ? null : Number(o.finalPrice),
          ivaPercent: o.ivaPercent === null ? null : Number(o.ivaPercent),
          stock: o.stock ?? 0,
          currency: o.currency,
        }))
      );
    } catch {
      return null;
    }
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
    plan?: string | null;
  }): OnboardingStep[] {
    const capabilities = getPlanCapabilities(isTenantPlan(opts.plan) ? opts.plan : "PRO");
    if (opts.type && opts.type !== "RETAILER" && opts.mode !== "preview") return [];
    return RETAILER_ONBOARDING_STEPS.filter((step) => {
      if (opts.mode === "existing" && step.skipIfExisting) return false;
      if (step.id === "org" && opts.hasTenant) return false;
      if (!opts.hasTenant) return step.id === "org";
      if (step.requiresTenant && !opts.hasTenant) return false;
      if (step.roles && opts.role && !step.roles.includes(opts.role)) return false;
      if (step.capability && !capabilities[step.capability]) return false;
      return true;
    });
  }
}

/** La suscripción inicial y su evento CREATED, dentro de la misma transacción del alta. */
async function createSubscription(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: InitialSubscriptionInput,
  actorUserId: string | null
) {
  const data = initialSubscription(input);
  const sub = await tx.subscription.create({ data: { tenantId, ...data } });
  await tx.subscriptionEvent.create({
    data: {
      tenantId,
      subscriptionId: sub.id,
      type: "CREATED",
      toStatus: data.status,
      toPlan: input.plan,
      actorUserId,
      data: { mode: input.mode },
    },
  });
}
