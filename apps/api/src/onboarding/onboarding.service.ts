import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
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

export type OnboardingStepId =
  | "org"
  | "plan"
  | "providers"
  | "search"
  | "filters"
  | "product"
  | "cart"
  | "orders"
  | "team"
  | "done";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  body: string;
  href: string | null;
  /** Solo dueño/admin ven este paso (equipo). */
  roles?: TenantRole[];
  /** Requiere haber creado la organización. */
  requiresTenant: boolean;
};

const RETAILER_STEPS: OnboardingStep[] = [
  {
    id: "org",
    title: "Nombrá tu comercio",
    body: "La organización es tu local en NODO. El nombre es lo que van a ver tus distribuidores y tu equipo.",
    href: null,
    requiresTenant: false,
  },
  {
    id: "plan",
    title: "Plan Mostrador (gratis)",
    body: "Entrá con el plan gratuito: búsqueda unificada, listas, pedidos de ejemplo y hasta 3 usuarios. Los planes Local y Cadena se habilitan cuando publiquemos precios.",
    href: null,
    requiresTenant: true,
  },
  {
    id: "providers",
    title: "Tus distribuidores",
    body: "Solo ves a quien está vinculado. Dejamos dos distribuidores de demostración con catálogo de prueba. Después los reemplazás canjeando un código real.",
    href: "/proveedores",
    requiresTenant: true,
  },
  {
    id: "search",
    title: "Buscá un producto",
    body: "Probá buscar «monitor», «logitech» o «ssd». Vas a ver resultados de ambos distros demo en una sola pantalla.",
    href: "/search?q=monitor",
    requiresTenant: true,
  },
  {
    id: "filters",
    title: "Filtros por marca, categoría y proveedor",
    body: "En la búsqueda podés filtrar por Distribuidora Demo Norte/Sur, por Logitech/Samsung/Redragon/Kingston y por Periféricos, Monitores o Almacenamiento.",
    href: "/search?q=teclado&marca=Redragon",
    requiresTenant: true,
  },
  {
    id: "product",
    title: "Ficha del producto",
    body: "Abrí un producto: precio y stock son de tu comercio. La ficha (nombre, marca, foto) es global.",
    href: "/search?q=mouse",
    requiresTenant: true,
  },
  {
    id: "cart",
    title: "Armá el carrito",
    body: "Agregá un ítem demo al carrito de la organización. Es el mismo carrito que ve todo el equipo del local.",
    href: "/cart",
    requiresTenant: true,
  },
  {
    id: "orders",
    title: "Pedidos de ejemplo",
    body: "En Pedidos hay dos pedidos offline de demostración (uno por distro). Ahí se entiende el historial y, si sumás un vendedor, la aprobación.",
    href: "/pedidos",
    requiresTenant: true,
  },
  {
    id: "team",
    title: "Invitá a tu equipo",
    body: "Desde Equipo creás compradores o vendedores. Cada persona nueva también pasa por este recorrido la primera vez que entra.",
    href: "/equipo",
    roles: ["OWNER", "ADMIN"],
    requiresTenant: true,
  },
  {
    id: "done",
    title: "Listo para operar",
    body: "Cuando quieras, cerrá el recorrido. Podés reabrirlo desde Ayuda. Los productos demo se pueden dejar o limpiar más adelante.",
    href: null,
    requiresTenant: true,
  },
];

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
      },
    });
    const tenant = await this.tenantContext.forUser(userId);
    const needsOnboarding = this.needsOnboarding(user, tenant);
    const steps = this.stepsFor(tenant?.tenantType ?? null, tenant?.tenantRole ?? null, Boolean(tenant));

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
      completed: Boolean(user.onboardingCompletedAt),
      completedAt: user.onboardingCompletedAt?.toISOString() ?? null,
      hasTenant: Boolean(tenant),
      tenant: tenant
        ? {
            id: tenant.tenantId,
            name: tenant.tenantName,
            type: tenant.tenantType,
            role: tenant.tenantRole,
            plan: (plan?.plan ?? "FREE") as TenantPlan,
            planLabel: TENANT_PLAN_LABELS[(plan?.plan ?? "FREE") as TenantPlan],
            planDescription: TENANT_PLAN_DESCRIPTIONS[(plan?.plan ?? "FREE") as TenantPlan],
          }
        : null,
      roleLabel: tenant ? TENANT_ROLE_LABELS[tenant.tenantRole] : null,
      steps,
      demo,
      canBootstrap: !tenant && user.role === "ROLE_USER",
    };
  }

  /**
   * Alta self-serve de un comercio (tipo 1): crea la organización, pone al
   * usuario como OWNER, asigna plan FREE y siembra catálogo/pedidos demo.
   */
  async bootstrapRetailer(userId: string, dto: BootstrapRetailerOrgDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === "ROLE_ADMIN") {
      throw new ForbiddenException("El administrador de plataforma no crea comercios desde el onboarding");
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
          plan: "FREE",
          contactEmail: dto.contactEmail?.trim() || user.email,
          contactPhone: dto.contactPhone?.trim() || null,
        },
      });
      await tx.tenantMembership.create({
        data: {
          tenantId: created.id,
          userId,
          role: "OWNER",
          title: "Dueño del local",
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

  async complete(userId: string) {
    const tenant = await this.tenantContext.forUser(userId);
    if (!tenant) {
      throw new BadRequestException("Creá tu organización antes de cerrar el recorrido");
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: new Date() },
    });
    return this.status(userId);
  }

  /** Reabre el recorrido (p. ej. desde Ayuda). */
  async reopen(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: null },
    });
    return this.status(userId);
  }

  /**
   * Vuelve a materializar productos y pedidos demo en un comercio que ya existe
   * (útil si se borraron ofertas o si un subusuario entra a un local vacío).
   */
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
            plan: "FREE",
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
          raw: {
            demo: true,
            sku: product.sku,
            brand: product.brand,
          },
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
      where: {
        tenantId: retailerTenantId,
        notes: { contains: "[DEMO]" },
      },
    });

    if (existingDemoOrders === 0) {
      const mouse = DEMO_PRODUCTS[0];
      const ssd = DEMO_PRODUCTS[3];
      await this.prisma.providerOrder.create({
        data: {
          userId: actorUserId,
          tenantId: retailerTenantId,
          createdByUserId: actorUserId,
          approvedByUserId: actorUserId,
          approvalDecidedAt: new Date(),
          provider: mouse.provider,
          channel: "OFFLINE",
          status: "OFFLINE",
          approvalStatus: "NOT_REQUIRED",
          paymentOption: "OFFLINE",
          notes: "[DEMO] Pedido de ejemplo — Distribuidora Demo Norte",
          subtotal: new Prisma.Decimal(mouse.price),
          impuestos: new Prisma.Decimal(0),
          percepciones: new Prisma.Decimal(0),
          total: new Prisma.Decimal(mouse.price),
          items: [
            {
              externalId: mouse.externalId,
              sku: mouse.sku,
              name: mouse.name,
              quantity: 1,
              unitPrice: mouse.price,
              ivaPercent: mouse.ivaPercent,
              pricingMode: "offline",
            },
          ],
          addressSnapshot: {},
          draftInput: { demo: true },
        },
      });
      await this.prisma.providerOrder.create({
        data: {
          userId: actorUserId,
          tenantId: retailerTenantId,
          createdByUserId: actorUserId,
          approvedByUserId: actorUserId,
          approvalDecidedAt: new Date(),
          provider: ssd.provider,
          channel: "OFFLINE",
          status: "OFFLINE",
          approvalStatus: "NOT_REQUIRED",
          paymentOption: "OFFLINE",
          notes: "[DEMO] Pedido de ejemplo — Distribuidora Demo Sur",
          subtotal: new Prisma.Decimal(ssd.price),
          impuestos: new Prisma.Decimal(0),
          percepciones: new Prisma.Decimal(0),
          total: new Prisma.Decimal(ssd.price),
          items: [
            {
              externalId: ssd.externalId,
              sku: ssd.sku,
              name: ssd.name,
              quantity: 2,
              unitPrice: ssd.price,
              ivaPercent: ssd.ivaPercent,
              pricingMode: "offline",
            },
          ],
          addressSnapshot: {},
          draftInput: { demo: true },
        },
      });
    }

    await this.prisma.tenant.update({
      where: { id: retailerTenantId },
      data: { demoSeededAt: new Date() },
    });

    return { distributors: distributors.map((d) => ({ id: d.id, name: d.name, providerKey: d.providerKey })) };
  }

  private needsOnboarding(
    user: { role: string; onboardingCompletedAt: Date | null },
    tenant: Awaited<ReturnType<TenantContextService["forUser"]>>
  ): boolean {
    if (user.role === "ROLE_ADMIN") return false;
    if (!tenant) return true;
    if (tenant.tenantType !== "RETAILER") return false;
    return !user.onboardingCompletedAt;
  }

  private stepsFor(
    type: TenantType | null,
    role: TenantRole | null,
    hasTenant: boolean
  ): OnboardingStep[] {
    if (type && type !== "RETAILER") return [];
    return RETAILER_STEPS.filter((step) => {
      if (step.id === "org" && hasTenant) return false;
      if (step.requiresTenant && !hasTenant) return step.id === "org";
      if (step.roles && role && !step.roles.includes(role)) return false;
      return true;
    }).filter((step) => {
      // Sin org solo mostramos el paso de crear org.
      if (!hasTenant) return step.id === "org";
      return true;
    });
  }
}
