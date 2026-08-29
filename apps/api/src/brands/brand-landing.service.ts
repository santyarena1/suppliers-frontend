import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { newPublicKey } from "./brand-orgs";
import { compileBrandHtml, sanitizeBrandHtml } from "./brand-html";
import { UpdateBrandLandingDto } from "./dto/brand.dto";

const LANDING_WRITERS = ["OWNER", "ADMIN", "MARKETING", "COMMERCIAL"] as const;

@Injectable()
export class BrandLandingService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(tenant: TenantContext) {
    this.assertBrand(tenant);
    const landing = await this.ensureRow(tenant);
    return this.serialize(landing, tenant.tenantName);
  }

  async updateMine(tenant: TenantContext, dto: UpdateBrandLandingDto) {
    this.assertBrand(tenant);
    if (!LANDING_WRITERS.includes(tenant.tenantRole as (typeof LANDING_WRITERS)[number])) {
      throw new ForbiddenException("No podés editar el espacio de la marca");
    }
    await this.ensureRow(tenant);
    const row = await this.prisma.brandLanding.update({
      where: { tenantId: tenant.tenantId },
      data: {
        ...(dto.published !== undefined ? { published: dto.published } : {}),
        ...(dto.headline !== undefined ? { headline: dto.headline?.trim() || tenant.tenantName } : {}),
        ...(dto.about !== undefined ? { about: dto.about?.trim() || null } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl?.trim() || null } : {}),
        ...(dto.heroUrl !== undefined ? { heroUrl: dto.heroUrl?.trim() || null } : {}),
        ...(dto.websiteUrl !== undefined ? { websiteUrl: dto.websiteUrl?.trim() || null } : {}),
        ...(dto.supportEmail !== undefined ? { supportEmail: dto.supportEmail?.trim() || null } : {}),
        ...(dto.supportPhone !== undefined ? { supportPhone: dto.supportPhone?.trim() || null } : {}),
        ...(dto.blocks !== undefined ? { blocks: dto.blocks as Prisma.InputJsonValue } : {}),
        ...(dto.html !== undefined ? { html: dto.html?.trim() ? sanitizeBrandHtml(dto.html) : null } : {}),
        ...(dto.primaryColor !== undefined ? { primaryColor: dto.primaryColor?.trim() || null } : {}),
        ...(dto.backgroundColor !== undefined ? { backgroundColor: dto.backgroundColor?.trim() || null } : {}),
        ...(dto.textColor !== undefined ? { textColor: dto.textColor?.trim() || null } : {}),
        ...(dto.fontFamily !== undefined ? { fontFamily: dto.fontFamily?.trim() || null } : {}),
      },
    });
    return this.serialize(row, tenant.tenantName);
  }

  async getPublic(publicKey: string) {
    const landing = await this.prisma.brandLanding.findUnique({
      where: { publicKey },
      include: { tenant: { select: { name: true, type: true, active: true } } },
    });
    if (!landing?.published || !landing.tenant.active || landing.tenant.type !== "BRAND") {
      throw new NotFoundException("Landing no encontrada");
    }
    const compiled = compileBrandHtml(landing.html ?? "");
    return {
      publicKey: landing.publicKey,
      name: landing.tenant.name,
      headline: landing.headline,
      about: landing.about,
      logoUrl: landing.logoUrl,
      heroUrl: landing.heroUrl,
      websiteUrl: landing.websiteUrl,
      supportEmail: landing.supportEmail,
      supportPhone: landing.supportPhone,
      blocks: landing.blocks,
      htmlDocument: compiled.html,
    };
  }

  private assertBrand(tenant: TenantContext) {
    if (tenant.tenantType !== "BRAND") throw new ForbiddenException("Esto es del panel de marca");
  }

  private async ensureRow(tenant: TenantContext) {
    const existing = await this.prisma.brandLanding.findUnique({ where: { tenantId: tenant.tenantId } });
    if (existing) return existing;
    return this.prisma.brandLanding.create({
      data: {
        tenantId: tenant.tenantId,
        publicKey: await this.uniquePublicKey(),
        headline: tenant.tenantName,
      },
    });
  }

  private serialize(
    landing: {
      publicKey: string;
      published: boolean;
      headline: string | null;
      about: string | null;
      logoUrl: string | null;
      heroUrl: string | null;
      websiteUrl: string | null;
      supportEmail: string | null;
      supportPhone: string | null;
      blocks: Prisma.JsonValue;
      html: string | null;
      primaryColor: string | null;
      backgroundColor: string | null;
      textColor: string | null;
      fontFamily: string | null;
    },
    name: string
  ) {
    return {
      name,
      publicKey: landing.publicKey,
      publicPath: `/m/${landing.publicKey}`,
      published: landing.published,
      headline: landing.headline,
      about: landing.about,
      logoUrl: landing.logoUrl,
      heroUrl: landing.heroUrl,
      websiteUrl: landing.websiteUrl,
      supportEmail: landing.supportEmail,
      supportPhone: landing.supportPhone,
      blocks: landing.blocks,
      html: landing.html,
      primaryColor: landing.primaryColor,
      backgroundColor: landing.backgroundColor,
      textColor: landing.textColor,
      fontFamily: landing.fontFamily,
    };
  }

  private async uniquePublicKey() {
    for (let i = 0; i < 8; i++) {
      const key = newPublicKey();
      const exists = await this.prisma.brandLanding.findUnique({ where: { publicKey: key } });
      if (!exists) return key;
    }
    return `${newPublicKey()}${Date.now().toString(36).slice(-4)}`.slice(0, 16);
  }
}
