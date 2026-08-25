import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Provider } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Un proveedor tal como lo ve un comercio, y por qué lo ve. */
export interface VisibleProvider {
  provider: Provider;
  name: string;
  /** `true` cuando hay vínculo: se le puede cargar la cuenta y traer catálogo. */
  linked: boolean;
  /** `true` cuando aparece solo porque el distribuidor pagó publicidad. */
  advertised: boolean;
  accountManager: { name: string; email: string } | null;
  /** Presente cuando hay vínculo: abre el chat con ese mayorista. */
  linkId: string | null;
  /** `true` cuando el comercio ya cargó usuario y contraseña de ese mayorista. */
  hasCredentials: boolean;
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
      return [
        {
          provider: propio.providerKey as Provider,
          name: propio.name,
          linked: true,
          advertised: false,
          accountManager: null,
          linkId: null,
          hasCredentials: true,
        },
      ];
    }

    const [links, publicitados, credenciales] = await Promise.all([
      this.prisma.tenantLink.findMany({
        where: {
          clientTenantId: tenantId,
          status: "ACTIVE",
          supplierTenant: { active: true, providerKey: { not: null } },
        },
        include: {
          supplierTenant: { select: { name: true, providerKey: true } },
          accountManager: { select: { username: true, email: true } },
        },
      }),
      this.prisma.tenant.findMany({
        where: {
          type: "DISTRIBUTOR",
          active: true,
          advertisingEnabled: true,
          providerKey: { not: null },
        },
        select: { id: true, name: true, providerKey: true },
      }),
      this.prisma.credential.findMany({
        where: { tenantId },
        select: { providerName: true },
      }),
    ]);

    const conCuenta = new Set(credenciales.map((row) => row.providerName));
    const visibles = new Map<string, VisibleProvider>();

    for (const link of links) {
      const key = link.supplierTenant.providerKey as Provider;
      visibles.set(key, {
        provider: key,
        name: link.supplierTenant.name,
        linked: true,
        advertised: false,
        accountManager: link.accountManager
          ? { name: link.accountManager.username, email: link.accountManager.email }
          : null,
        linkId: link.id,
        hasCredentials: conCuenta.has(key),
      });
    }

    // La publicidad paga solo agrega presencia: deja que el comercio sepa que el
    // distribuidor existe y pueda conectarse, no le abre el catálogo de nadie.
    for (const anunciante of publicitados) {
      const key = anunciante.providerKey as Provider;
      if (visibles.has(key) || anunciante.id === tenantId) continue;
      visibles.set(key, {
        provider: key,
        name: anunciante.name,
        linked: false,
        advertised: true,
        accountManager: null,
        linkId: null,
        hasCredentials: conCuenta.has(key),
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
    return { ...visible, linked: true, advertised: false };
  }
}
