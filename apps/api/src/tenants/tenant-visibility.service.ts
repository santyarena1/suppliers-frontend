import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  getPlanCapabilities,
  isListProviderKey,
  isTenantPlan,
  mergeLearnedPaymentOptions,
  providerHasCatalogAdapter,
  parsePaymentOptions,
  providerHasIvaRate,
  type IvaAdjustment,
  type PaymentOption,
  type Provider,
  selectSearchProviders,
} from "@nodo/shared";
import { domainEvents } from "../common/events/domain-events";
import { isDemoDistributorKey, viewerSeesDemoCatalog } from "../onboarding/onboarding-demo";
import { PrismaService } from "../prisma/prisma.service";
import { snapshotJson } from "../providers/json-value";

export type PurchasePolicyView = {
  /** API o LIST: con LIST los precios salen de una planilla y el carrito solo arma un mensaje. */
  priceChannel: "API" | "LIST";
  manualIibbPercent: number | null;
  manualPerceptionsPercent: number | null;
  /** Última percepción (%) cotizada por el portal, recordada entre consultas. */
  learnedIibbPercent: number | null;
  learnedIibbAt: string | null;
  /** Formas de pago con su descuento o recargo. Solo informativas. */
  paymentOptions: PaymentOption[];
  acceptsOffline: boolean;
  acceptsScheme: boolean;
  offlineIvaAdjustment: IvaAdjustment | null;
  schemeIvaAdjustment: IvaAdjustment | null;
  schemeDiscountPercent: number | null;
};

/** Un proveedor tal como lo ve un comercio, y por qué lo ve. */
export interface VisibleProvider {
  provider: Provider;
  name: string;
  /** `true` cuando hay vínculo: se le puede cargar la cuenta y traer catálogo. */
  linked: boolean;
  /** `true` cuando aparece solo porque el distribuidor pagó publicidad. */
  advertised: boolean;
  /** `true` cuando el comercio se conectó solo cargando su lista: sin vendedor ni chat hasta que el proveedor lo reconozca. */
  selfConnected: boolean;
  accountManager: { name: string; email: string } | null;
  discountPercent: number | null;
  /** Vínculo comercial, para abrir el chat. Ausente si solo hay publicidad. */
  linkId: string | null;
  /** Cómo este comercio compra offline / en esquema a este distribuidor. */
  purchase: PurchasePolicyView;
  /**
   * El administrador lo ocultó en toda la plataforma: el vínculo sigue, pero su
   * catálogo no aparece en el buscador ni en ninguna vista. Nunca aplica a lo que
   * el comercio cargó con su propia lista (ver `hiddenForViewer`).
   */
  platformHidden: boolean;
  /**
   * Participa del buscador. El plan Base busca en hasta 5 a la vez: el resto sigue
   * conectado (credenciales, lista, vínculo intactos) pero fuera de la búsqueda.
   * Ver docs/PLAN_SUSCRIPCIONES.md.
   */
  inSearch: boolean;
  /** Lo que eligió el comercio: `null` = nunca tocó el interruptor. */
  includeInSearch: boolean | null;
  /**
   * Tiene precios del comercio: cuenta sincronizada, lista aplicada o lista del
   * distribuidor vinculado. Sin esto no entra al buscador ni ocupa lugar del plan.
   */
  configured: boolean;
}

/** Cuántos proveedores buscan a la vez y cuántos permite el plan. */
export interface SearchUsage {
  connectedProviders: number;
  activeSearchProviders: number;
  maxSearchProviders: number | null;
}

/**
 * Qué proveedores existen para una organización.
 *
 * El descubrimiento en NODO es cerrado: un comercio conoce los distribuidores con los
 * que tiene vínculo y nada más. Un proveedor no vinculado no aparece ni siquiera como
 * existente — no es que esté deshabilitado, es que para ese comercio no existe. Las
 * únicas dos formas de que aparezca alguien nuevo son que el distribuidor pague
 * publicidad o que le pase un código de acceso por fuera de la plataforma.
 */
@Injectable()
export class TenantVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Guarda la percepción que el portal del proveedor le cotizó al comercio.
   *
   * El carrito es el único lugar donde el sistema pregunta por percepciones, y
   * solo pregunta por los proveedores que tienen items adentro. Si eso viviera
   * únicamente en el navegador, bastaba pasar unos días sin armar un carrito de
   * ese proveedor —o entrar desde otra máquina— para que la percepción
   * desapareciera de la búsqueda. Se recuerda acá y se pisa cuando el portal
   * cotiza distinto.
   */
  async recordObservedIibb(tenantId: string, provider: string, percent: number): Promise<PurchasePolicyView> {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new BadRequestException("Porcentaje de percepción fuera de rango");
    }
    const learnedIibbPercent = Math.round(percent * 100) / 100;
    const config = await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, learnedIibbPercent, learnedIibbAt: new Date() },
      update: { learnedIibbPercent, learnedIibbAt: new Date() },
    });
    return purchaseFromConfig(provider, config);
  }

  /** Formas de pago que informó el portal al cotizar. No pisa lo cargado a mano. */
  async recordObservedPaymentOptions(
    tenantId: string,
    provider: string,
    options: unknown
  ): Promise<PurchasePolicyView> {
    const learned = parsePaymentOptions(options).map((o) => ({
      ...o,
      source: "cart" as const,
      at: new Date().toISOString(),
    }));
    const current = await this.prisma.providerSyncConfig.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
      select: { paymentOptions: true },
    });
    const merged = mergeLearnedPaymentOptions(parsePaymentOptions(current?.paymentOptions), learned);
    const config = await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, paymentOptions: snapshotJson(merged) },
      update: { paymentOptions: snapshotJson(merged) },
    });
    return purchaseFromConfig(provider, config);
  }

  async listFor(tenantId: string, viewerUserId?: string): Promise<VisibleProvider[]> {
    const propio = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, type: true, providerKey: true, plan: true },
    });
    if (!propio) return [];
    const hidden = await this.platformHiddenProviders();

    // Un distribuidor no le compra a nadie: lo único que ve es su propio catálogo.
    if (propio.type !== "RETAILER") {
      if (!propio.providerKey) return [];
      const ownConfig = await this.prisma.providerSyncConfig.findUnique({
        where: { tenantId_provider: { tenantId, provider: propio.providerKey } },
      });
      return [
        {
          provider: propio.providerKey as Provider,
          name: propio.name,
          linked: true,
          advertised: false,
          selfConnected: false,
          accountManager: null,
          discountPercent: null,
          linkId: null,
          purchase: purchaseFromConfig(propio.providerKey, ownConfig),
          platformHidden: hiddenForViewer(hidden, propio.providerKey, false),
          inSearch: !hiddenForViewer(hidden, propio.providerKey, false),
          includeInSearch: null,
          configured: true,
        },
      ];
    }

    const includeDemo = await this.viewerSeesDemo(viewerUserId);
    const now = new Date();
    const [links, publicitados, configs] = await Promise.all([
      this.prisma.tenantLink.findMany({
        where: {
          clientTenantId: tenantId,
          status: { in: ["ACTIVE", "LIST_CONNECTED"] },
          supplierTenant: { active: true, providerKey: { not: null } },
        },
        include: {
          supplierTenant: { select: { name: true, providerKey: true } },
          accountManager: { select: { username: true, email: true } },
        },
      }),
      this.prisma.adCampaign.findMany({
        where: {
          status: "ACTIVE",
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
          slot: { key: "discovery", enabled: true },
          tenant: {
            type: "DISTRIBUTOR",
            active: true,
            advertisingEnabled: true,
            providerKey: { not: null },
          },
        },
        select: { tenant: { select: { id: true, name: true, providerKey: true } } },
      }),
      this.prisma.providerSyncConfig.findMany({
        where: { tenantId },
        select: {
          provider: true,
          priceChannel: true,
          manualIibbPercent: true,
          manualPerceptionsPercent: true,
          learnedIibbPercent: true,
          learnedIibbAt: true,
          paymentOptions: true,
          acceptsOffline: true,
          acceptsScheme: true,
          offlineIvaAdjustment: true,
          schemeIvaAdjustment: true,
          schemeDiscountPercent: true,
          includeInSearch: true,
          includeInSearchAt: true,
        },
      }),
    ]);
    const configByProvider = new Map(configs.map((c) => [c.provider, c]));

    const visibles = new Map<string, Omit<VisibleProvider, "platformHidden" | "inSearch" | "includeInSearch" | "configured">>();

    for (const link of links) {
      const key = link.supplierTenant.providerKey as Provider;
      if (isDemoDistributorKey(key) && !includeDemo) continue;
      const selfConnected = link.status === "LIST_CONNECTED";
      visibles.set(key, {
        provider: key,
        name: link.supplierTenant.name,
        linked: true,
        advertised: false,
        selfConnected,
        accountManager:
          link.accountManager && !selfConnected
            ? { name: link.accountManager.username, email: link.accountManager.email }
            : null,
        // Sin vendedor no hay con quién chatear: el vínculo existe pero no se ofrece.
        linkId: selfConnected ? null : link.id,
        discountPercent: link.discountPercent == null ? null : Number(link.discountPercent),
        purchase: purchaseFromConfig(key, configByProvider.get(key)),
      });
    }

    // La publicidad paga solo agrega presencia: deja que el comercio sepa que el
    // distribuidor existe y pueda conectarse, no le abre el catálogo de nadie.
    for (const row of publicitados) {
      const anunciante = row.tenant;
      const key = anunciante.providerKey as Provider;
      if (isDemoDistributorKey(key) && !includeDemo) continue;
      if (visibles.has(key) || anunciante.id === tenantId) continue;
      visibles.set(key, {
        provider: key,
        name: anunciante.name,
        linked: false,
        advertised: true,
        selfConnected: false,
        accountManager: null,
        discountPercent: null,
        linkId: null,
        purchase: purchaseFromConfig(key, null),
      });
    }

    // El administrador de la plataforma ve todo: cada distribuidor activo con clave
    // de proveedor aparece vinculado, sin código de acceso ni vendedor asignado.
    const platformAdminOrg = await this.isPlatformAdminOrg(tenantId);
    if (platformAdminOrg) {
      const distribuidores = await this.prisma.tenant.findMany({
        where: { type: "DISTRIBUTOR", active: true, providerKey: { not: null } },
        select: { id: true, name: true, providerKey: true },
      });
      for (const d of distribuidores) {
        const key = d.providerKey as Provider;
        if (isDemoDistributorKey(key) && !includeDemo) continue;
        const current = visibles.get(key);
        if (current?.linked || d.id === tenantId) continue;
        visibles.set(key, {
          provider: key,
          name: d.name,
          linked: true,
          advertised: false,
          selfConnected: false,
          accountManager: null,
          discountPercent: null,
          linkId: null,
          purchase: purchaseFromConfig(key, configByProvider.get(key)),
        });
      }
    }

    // Administración ve todo lo vinculado como configurado: opera sin cuenta propia.
    const priced = platformAdminOrg ? null : await this.providersWithPrices(tenantId, [...visibles.keys()]);
    const rows = [...visibles.values()]
      .map((v) => ({
        ...v,
        platformHidden: hiddenForViewer(hidden, v.provider, v.selfConnected),
        configured: priced === null || priced.has(v.provider),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    // Administración opera sin tope; el resto, según el plan de la organización.
    const max = platformAdminOrg ? null : maxSearchProvidersFor(propio.plan);
    const inSearch = selectSearchProviders(
      rows
        // Un proveedor sin configurar no busca ni le quita el lugar a uno configurado.
        // Los demos del recorrido guiado tampoco: buscan aparte, sin ocupar lugar del plan.
        .filter((v) => v.linked && !v.platformHidden && v.configured && !isDemoDistributorKey(v.provider))
        .map((v) => ({
          provider: v.provider,
          name: v.name,
          includeInSearch: configByProvider.get(v.provider)?.includeInSearch ?? null,
          chosenAt: configByProvider.get(v.provider)?.includeInSearchAt ?? null,
        })),
      max
    );
    for (const v of rows) {
      const choice = configByProvider.get(v.provider)?.includeInSearch ?? null;
      if (isDemoDistributorKey(v.provider) && v.linked && !v.platformHidden && choice !== false) inSearch.add(v.provider);
    }
    return rows.map((v) => ({
      ...v,
      inSearch: inSearch.has(v.provider),
      includeInSearch: configByProvider.get(v.provider)?.includeInSearch ?? null,
    }));
  }

  /** Conectados y activos en búsqueda, para el contador del panel y `/my/subscription`. */
  async searchUsage(tenantId: string, viewerUserId?: string): Promise<SearchUsage> {
    const [visibles, tenant, platformAdminOrg] = await Promise.all([
      this.listFor(tenantId, viewerUserId),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, type: true } }),
      this.isPlatformAdminOrg(tenantId),
    ]);
    const linked = visibles.filter((v) => v.linked && v.configured && !isDemoDistributorKey(v.provider));
    return {
      connectedProviders: linked.length,
      activeSearchProviders: linked.filter((v) => v.inSearch).length,
      maxSearchProviders:
        platformAdminOrg || tenant?.type !== "RETAILER" ? null : maxSearchProvidersFor(tenant?.plan ?? "PRO"),
    };
  }

  /**
   * Prende o apaga un proveedor en el buscador. Nunca toca credenciales, lista ni
   * vínculo. Prender uno de más con el plan Base responde 409 `PLAN_SEARCH_LIMIT`.
   */
  async setIncludeInSearch(
    tenantId: string,
    provider: Provider,
    enabled: boolean,
    opts: { viewerUserId?: string; onLimit: (max: number, active: number) => Error }
  ): Promise<SearchUsage & { provider: Provider; inSearch: boolean }> {
    const visible = await this.assertLinked(tenantId, provider, opts.viewerUserId);
    if (enabled && !visible.inSearch) {
      const usage = await this.searchUsage(tenantId, opts.viewerUserId);
      if (usage.maxSearchProviders != null && usage.activeSearchProviders >= usage.maxSearchProviders) {
        throw opts.onLimit(usage.maxSearchProviders, usage.activeSearchProviders);
      }
    }
    await this.prisma.providerSyncConfig.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, includeInSearch: enabled, includeInSearchAt: new Date() },
      update: { includeInSearch: enabled, includeInSearchAt: new Date() },
    });
    const usage = await this.searchUsage(tenantId, opts.viewerUserId);
    const after = (await this.listFor(tenantId, opts.viewerUserId)).find((v) => v.provider === provider);
    return { ...usage, provider, inSearch: Boolean(after?.inSearch) };
  }

  /** Proveedores con al menos una oferta activa con precio de este comercio. */
  private async providersWithPrices(tenantId: string, providers: string[]): Promise<Set<string>> {
    if (providers.length === 0) return new Set();
    const rows = await this.prisma.tenantProductOffer.groupBy({
      by: ["provider"],
      where: {
        tenantId,
        active: true,
        provider: { in: providers },
        OR: [{ price: { not: null } }, { finalPrice: { not: null } }],
      },
      _count: { _all: true },
    });
    return new Set(rows.map((r) => r.provider));
  }

  private async platformHiddenProviders(): Promise<Set<string>> {
    const rows = await this.prisma.providerDisplayConfig.findMany({
      where: { visible: false },
      select: { provider: true },
    });
    return new Set(rows.map((r) => r.provider));
  }

  /**
   * `true` si en esta organización (o en una que la espeja, como Administración →
   * Comercio de Pruebas) hay una persona con rol de administrador de plataforma.
   */
  private async isPlatformAdminOrg(tenantId: string): Promise<boolean> {
    const admin = await this.prisma.tenantMembership.findFirst({
      where: {
        active: true,
        user: { role: "ROLE_ADMIN" },
        tenant: { OR: [{ id: tenantId }, { mirrorsCommercialFromId: tenantId }] },
      },
      select: { id: true },
    });
    return admin != null;
  }

  private async viewerSeesDemo(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        onboardingCompletedAt: true,
        onboardingReplay: true,
        onboardingPreviewRestoreTenantId: true,
      },
    });
    return Boolean(user && viewerSeesDemoCatalog(user));
  }

  /** Claves de los proveedores cuyo catálogo puede leer esta organización. */
  async linkedProviderKeys(tenantId: string, viewerUserId?: string): Promise<string[]> {
    const visibles = await this.listFor(tenantId, viewerUserId);
    return visibles.filter((v) => v.linked).map((v) => v.provider);
  }

  /** Vinculados y no ocultos por la plataforma: de estos se puede leer catálogo. */
  async readableCatalogKeys(tenantId: string, viewerUserId?: string): Promise<string[]> {
    const visibles = await this.listFor(tenantId, viewerUserId);
    return visibles.filter((v) => v.linked && !v.platformHidden).map((v) => v.provider);
  }

  /** Los que participan del buscador y del catálogo agregado (respeta el tope del plan). */
  async searchableCatalogKeys(tenantId: string, viewerUserId?: string): Promise<string[]> {
    const visibles = await this.listFor(tenantId, viewerUserId);
    return visibles.filter((v) => v.inSearch).map((v) => v.provider);
  }

  async canSearch(tenantId: string, provider: Provider, viewerUserId?: string): Promise<boolean> {
    const visible = (await this.listFor(tenantId, viewerUserId)).find((v) => v.provider === provider);
    return Boolean(visible?.inSearch);
  }

  async canReadCatalog(tenantId: string, provider: Provider, viewerUserId?: string): Promise<boolean> {
    const visible = (await this.listFor(tenantId, viewerUserId)).find((v) => v.provider === provider);
    return Boolean(visible?.linked && !visible.platformHidden);
  }

  async isLinked(tenantId: string, provider: Provider, viewerUserId?: string): Promise<boolean> {
    const visible = (await this.listFor(tenantId, viewerUserId)).find((v) => v.provider === provider);
    return Boolean(visible?.linked);
  }

  /**
   * Corta si la organización no tiene por qué saber que ese proveedor existe.
   *
   * Responde 404 y no 403 a propósito: un "no tenés permiso" ya confirmaría que el
   * proveedor existe, que es justamente lo que no se puede filtrar.
   */
  async assertVisible(tenantId: string, provider: Provider, viewerUserId?: string): Promise<VisibleProvider> {
    const visible = (await this.listFor(tenantId, viewerUserId)).find((v) => v.provider === provider);
    if (!visible) throw new NotFoundException("Proveedor no encontrado");
    return visible;
  }

  /** Igual, pero además exige vínculo: ver que existe no alcanza para operar. */
  async assertLinked(tenantId: string, provider: Provider, viewerUserId?: string): Promise<VisibleProvider> {
    const visible = await this.assertVisible(tenantId, provider, viewerUserId);
    if (!visible.linked) {
      throw new ForbiddenException(
        `Todavía no estás vinculado con ${visible.name}. Pedile un código de acceso para conectarte.`
      );
    }
    return visible;
  }

  /**
   * Deja vinculado al comercio con un proveedor que ya podía ver.
   *
   * Es lo que pasa cuando alguien carga la cuenta de un distribuidor que descubrió por
   * publicidad: tener cuenta con ellos *es* el vínculo, no hace falta pedir un código
   * para algo que el distribuidor ya eligió mostrar.
   */
  async ensureLinked(tenantId: string, provider: Provider): Promise<VisibleProvider> {
    const visible = await this.assertVisible(tenantId, provider);
    if (visible.linked) return visible;

    const supplier = await this.prisma.tenant.findUnique({
      where: { providerKey: provider },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException("Proveedor no encontrado");

    await this.prisma.tenantLink.upsert({
      where: {
        clientTenantId_supplierTenantId: { clientTenantId: tenantId, supplierTenantId: supplier.id },
      },
      create: { clientTenantId: tenantId, supplierTenantId: supplier.id, status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
    domainEvents.emit("tenant.linked", { clientTenantId: tenantId, supplierTenantId: supplier.id, provider });
    return { ...visible, linked: true, advertised: false };
  }
}

function maxSearchProvidersFor(plan: string | null | undefined): number | null {
  return getPlanCapabilities(isTenantPlan(plan) ? plan : "PRO").maxSearchProviders;
}

const EMPTY_PURCHASE: PurchasePolicyView = {
  priceChannel: "API",
  manualIibbPercent: null,
  manualPerceptionsPercent: null,
  learnedIibbPercent: null,
  learnedIibbAt: null,
  paymentOptions: [],
  acceptsOffline: false,
  acceptsScheme: false,
  offlineIvaAdjustment: null,
  schemeIvaAdjustment: null,
  schemeDiscountPercent: null,
};

function asAdj(value: unknown): IvaAdjustment | null {
  return value === "REMOVE" || value === "HALF" || value === "FLAT_10_5" ? value : null;
}

function purchaseFromConfig(
  provider: string,
  config: {
    priceChannel?: string | null;
    manualIibbPercent?: unknown;
    manualPerceptionsPercent?: unknown;
    learnedIibbPercent?: unknown;
    learnedIibbAt?: Date | string | null;
    paymentOptions?: unknown;
    acceptsOffline: boolean;
    acceptsScheme: boolean;
    offlineIvaAdjustment?: string | null;
    schemeIvaAdjustment?: string | null;
    ivaAdjustment?: string | null;
    schemeDiscountPercent: unknown;
  } | null | undefined
): PurchasePolicyView {
  const priceChannel: "API" | "LIST" =
    config?.priceChannel === "LIST" ||
    isListProviderKey(provider) ||
    (config?.priceChannel == null && !providerHasCatalogAdapter(provider))
      ? "LIST"
      : "API";
  const manual = {
    priceChannel,
    manualIibbPercent: config?.manualIibbPercent == null ? null : Number(config.manualIibbPercent),
    manualPerceptionsPercent: config?.manualPerceptionsPercent == null ? null : Number(config.manualPerceptionsPercent),
    learnedIibbPercent: config?.learnedIibbPercent == null ? null : Number(config.learnedIibbPercent),
    learnedIibbAt: config?.learnedIibbAt ? new Date(config.learnedIibbAt).toISOString() : null,
    paymentOptions: parsePaymentOptions(config?.paymentOptions),
  };
  if (!config || !providerHasIvaRate(provider, priceChannel)) return { ...EMPTY_PURCHASE, ...manual };
  const legacy = asAdj(config.ivaAdjustment);
  return {
    ...manual,
    acceptsOffline: config.acceptsOffline,
    acceptsScheme: config.acceptsScheme,
    offlineIvaAdjustment: asAdj(config.offlineIvaAdjustment) ?? legacy,
    schemeIvaAdjustment: asAdj(config.schemeIvaAdjustment) ?? legacy,
    schemeDiscountPercent:
      config.schemeDiscountPercent == null ? null : Number(config.schemeDiscountPercent),
  };
}

/**
 * El interruptor global de visibilidad sirve para apagar integraciones de la
 * plataforma. Un proveedor por lista (`LIST_*`) o uno que el comercio conectó
 * cargando su propio Excel existen porque ese comercio los trajo: ocultarlos
 * desde el admin le borraba del buscador su propia lista sin decirle nada.
 */
export function hiddenForViewer(hidden: Set<string>, provider: string, selfConnected: boolean): boolean {
  if (!hidden.has(provider)) return false;
  if (selfConnected || isListProviderKey(provider)) return false;
  return true;
}
