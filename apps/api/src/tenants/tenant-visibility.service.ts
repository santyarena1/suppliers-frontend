import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { isListProviderKey, providerHasIvaRate, type IvaAdjustment, type Provider } from "@nodo/shared";
import { domainEvents } from "../common/events/domain-events";
import { PrismaService } from "../prisma/prisma.service";

export type PurchasePolicyView = {
  /** API o LIST: con LIST los precios salen de una planilla y el carrito solo arma un mensaje. */
  priceChannel: "API" | "LIST";
  manualIibbPercent: number | null;
  manualPerceptionsPercent: number | null;
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

  async listFor(tenantId: string): Promise<VisibleProvider[]> {
    const propio = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, type: true, providerKey: true },
    });
    if (!propio) return [];

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
        },
      ];
    }

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
          acceptsOffline: true,
          acceptsScheme: true,
          offlineIvaAdjustment: true,
          schemeIvaAdjustment: true,
          schemeDiscountPercent: true,
        },
      }),
    ]);
    const configByProvider = new Map(configs.map((c) => [c.provider, c]));

    const visibles = new Map<string, VisibleProvider>();

    for (const link of links) {
      const key = link.supplierTenant.providerKey as Provider;
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

    return [...visibles.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  /** Claves de los proveedores cuyo catálogo puede leer esta organización. */
  async linkedProviderKeys(tenantId: string): Promise<string[]> {
    const visibles = await this.listFor(tenantId);
    return visibles.filter((v) => v.linked).map((v) => v.provider);
  }

  async isLinked(tenantId: string, provider: Provider): Promise<boolean> {
    const visible = (await this.listFor(tenantId)).find((v) => v.provider === provider);
    return Boolean(visible?.linked);
  }

  /**
   * Corta si la organización no tiene por qué saber que ese proveedor existe.
   *
   * Responde 404 y no 403 a propósito: un "no tenés permiso" ya confirmaría que el
   * proveedor existe, que es justamente lo que no se puede filtrar.
   */
  async assertVisible(tenantId: string, provider: Provider): Promise<VisibleProvider> {
    const visible = (await this.listFor(tenantId)).find((v) => v.provider === provider);
    if (!visible) throw new NotFoundException("Proveedor no encontrado");
    return visible;
  }

  /** Igual, pero además exige vínculo: ver que existe no alcanza para operar. */
  async assertLinked(tenantId: string, provider: Provider): Promise<VisibleProvider> {
    const visible = await this.assertVisible(tenantId, provider);
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

const EMPTY_PURCHASE: PurchasePolicyView = {
  priceChannel: "API",
  manualIibbPercent: null,
  manualPerceptionsPercent: null,
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
    acceptsOffline: boolean;
    acceptsScheme: boolean;
    offlineIvaAdjustment?: string | null;
    schemeIvaAdjustment?: string | null;
    ivaAdjustment?: string | null;
    schemeDiscountPercent: unknown;
  } | null | undefined
): PurchasePolicyView {
  const priceChannel: "API" | "LIST" =
    config?.priceChannel === "LIST" || (config?.priceChannel == null && isListProviderKey(provider)) ? "LIST" : "API";
  const manual = {
    priceChannel,
    manualIibbPercent: config?.manualIibbPercent == null ? null : Number(config.manualIibbPercent),
    manualPerceptionsPercent: config?.manualPerceptionsPercent == null ? null : Number(config.manualPerceptionsPercent),
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
