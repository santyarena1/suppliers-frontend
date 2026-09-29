import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantType } from "@nodo/shared";
import { domainEvents } from "../common/events/domain-events";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { tenantLinkAllowed } from "../tenants/link-sides";

/** Estado de quien mira el link público de una marca, para saber qué ofrecerle. */
export type PublicLinkState =
  | { state: "LINKED"; linkId: string; brandName: string }
  | { state: "CAN_LINK"; brandName: string }
  | { state: "CLOSED"; brandName: string; reason: string };

/**
 * El link público de la marca como puerta de entrada: quien lo recibió puede
 * vincular su comercio (o su distribuidora) con la marca sin código.
 * Diseño: docs/superpowers/specs/2026-09-29-marcas-semaforo-design.md (etapa 2).
 */
@Injectable()
export class BrandPublicLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async stateFor(tenant: TenantContext, publicKey: string): Promise<PublicLinkState> {
    const brand = await this.brandFor(publicKey);
    const closed = this.closedReason(tenant, brand);
    const link = await this.prisma.tenantLink.findUnique({
      where: { clientTenantId_supplierTenantId: { clientTenantId: tenant.tenantId, supplierTenantId: brand.tenantId } },
      select: { id: true, status: true },
    });
    if (link && link.status !== "REVOKED") return { state: "LINKED", linkId: link.id, brandName: brand.name };
    if (link?.status === "REVOKED") {
      return { state: "CLOSED", brandName: brand.name, reason: "La marca cerró el vínculo con tu organización." };
    }
    if (closed) return { state: "CLOSED", brandName: brand.name, reason: closed };
    return { state: "CAN_LINK", brandName: brand.name };
  }

  async link(tenant: TenantContext, publicKey: string) {
    const state = await this.stateFor(tenant, publicKey);
    if (state.state === "LINKED") return { linkId: state.linkId, brandName: state.brandName, created: false };
    if (state.state === "CLOSED") throw new ForbiddenException(state.reason);

    const brand = await this.brandFor(publicKey);
    // create (no upsert): un vínculo que la marca revocó no se reabre desde el link.
    const created = await this.prisma.tenantLink
      .create({
        data: { clientTenantId: tenant.tenantId, supplierTenantId: brand.tenantId, status: "ACTIVE" },
        select: { id: true },
      })
      .catch(async (err: unknown) => {
        // Dos clics a la vez: el otro ya lo creó.
        const existing = await this.prisma.tenantLink.findUnique({
          where: {
            clientTenantId_supplierTenantId: { clientTenantId: tenant.tenantId, supplierTenantId: brand.tenantId },
          },
          select: { id: true, status: true },
        });
        if (existing && existing.status !== "REVOKED") return { id: existing.id };
        throw err;
      });

    domainEvents.emit("tenant.linked", {
      clientTenantId: tenant.tenantId,
      supplierTenantId: brand.tenantId,
      provider: null,
    });
    return { linkId: created.id, brandName: brand.name, created: true };
  }

  private async brandFor(publicKey: string) {
    const landing = await this.prisma.brandLanding.findUnique({
      where: { publicKey },
      select: {
        tenantId: true,
        published: true,
        allowPublicLink: true,
        tenant: { select: { name: true, type: true, active: true } },
      },
    });
    if (!landing?.published || !landing.tenant.active || landing.tenant.type !== "BRAND") {
      throw new NotFoundException("Esa marca no tiene una página publicada");
    }
    return { tenantId: landing.tenantId, name: landing.tenant.name, allowPublicLink: landing.allowPublicLink };
  }

  private closedReason(tenant: TenantContext, brand: { tenantId: string; allowPublicLink: boolean }): string | null {
    if (tenant.tenantId === brand.tenantId) return "Es tu propia marca.";
    if (!tenantLinkAllowed(tenant.tenantType as TenantType, "BRAND")) {
      return "Solo un comercio o un distribuidor se puede vincular con una marca.";
    }
    if (!brand.allowPublicLink) return "La marca no habilitó vincularse desde este link. Pedile un código.";
    return null;
  }
}

export function assertPublicKey(publicKey: string) {
  if (!/^[a-z0-9-]{4,40}$/i.test(publicKey)) throw new BadRequestException("Link inválido");
}
