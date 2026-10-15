import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma, QuoteSettings } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assetIdOf, MAX_IMAGE_BYTES, sniffImage } from "../storefront/storefront-rules";

export const QUOTE_THEMES = ["modern", "classic", "minimal", "bold"] as const;
export const QUOTE_FONTS = ["sans", "serif", "mono"] as const;
export const QUOTE_PRICE_DISPLAYS = ["FINAL", "NET"] as const;
export const QUOTE_LOGO_PURPOSE = "quote-logo";
export const MAX_VALIDITY_DAYS = 90;

/** Plantilla de los presupuestos tal como la usa la web (PDF, valores por defecto). */
export interface QuoteSettingsView {
  theme: (typeof QUOTE_THEMES)[number];
  accentColor: string;
  font: (typeof QUOTE_FONTS)[number];
  logoUrl: string | null;
  businessName: string;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  intro: string | null;
  terms: string | null;
  footer: string | null;
  validityDays: number;
  numberPrefix: string;
  showImages: boolean;
  showSku: boolean;
  showBrand: boolean;
  priceDisplay: (typeof QUOTE_PRICE_DISPLAYS)[number];
  /** Descuento máximo para quien no ve costos; `null` = sin tope. */
  maxSellerDiscount: number | null;
  updatedAt: string | null;
}

export type QuoteSettingsInput = Partial<Omit<QuoteSettingsView, "updatedAt" | "logoUrl">>;

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Texto opcional limpio: vacío = null, recortado al largo máximo. */
function text(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new BadRequestException("Texto inválido");
  const t = value.replace(/\r\n/g, "\n").trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Plantilla de presupuestos por comercio. La lee todo el equipo (para armar el
 * PDF); la cambian dueño y admin.
 */
@Injectable()
export class QuoteSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string): Promise<QuoteSettingsView> {
    const [row, tenant] = await Promise.all([
      this.prisma.quoteSettings.findUnique({ where: { tenantId } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ]);
    return toView(row, tenant?.name ?? "");
  }

  async update(tenantId: string, userId: string, input: QuoteSettingsInput): Promise<QuoteSettingsView> {
    const data: Prisma.QuoteSettingsUncheckedUpdateInput = { updatedById: userId };
    if (input.theme !== undefined) {
      if (!QUOTE_THEMES.includes(input.theme)) throw new BadRequestException("Estilo inválido");
      data.theme = input.theme;
    }
    if (input.accentColor !== undefined) {
      if (typeof input.accentColor !== "string" || !HEX.test(input.accentColor)) throw new BadRequestException("Color inválido");
      data.accentColor = input.accentColor.toLowerCase();
    }
    if (input.font !== undefined) {
      if (!QUOTE_FONTS.includes(input.font)) throw new BadRequestException("Letra inválida");
      data.font = input.font;
    }
    if (input.priceDisplay !== undefined) {
      if (!QUOTE_PRICE_DISPLAYS.includes(input.priceDisplay)) throw new BadRequestException("Forma de mostrar precios inválida");
      data.priceDisplay = input.priceDisplay;
    }
    if (input.businessName !== undefined) data.businessName = text(input.businessName, 120);
    if (input.taxId !== undefined) data.taxId = text(input.taxId, 40);
    if (input.address !== undefined) data.address = text(input.address, 200);
    if (input.phone !== undefined) data.phone = text(input.phone, 60);
    if (input.email !== undefined) data.email = text(input.email, 120);
    if (input.website !== undefined) data.website = text(input.website, 120);
    if (input.intro !== undefined) data.intro = text(input.intro, 1000);
    if (input.terms !== undefined) data.terms = text(input.terms, 3000);
    if (input.footer !== undefined) data.footer = text(input.footer, 300);
    if (input.numberPrefix !== undefined) {
      const prefix = (text(input.numberPrefix, 8) ?? "").replace(/[^\w\-#/ ]/g, "");
      data.numberPrefix = prefix;
    }
    if (input.validityDays !== undefined) {
      const days = num(input.validityDays);
      if (days == null || !Number.isInteger(days) || days < 1 || days > MAX_VALIDITY_DAYS) {
        throw new BadRequestException(`La validez va de 1 a ${MAX_VALIDITY_DAYS} días`);
      }
      data.validityDays = days;
    }
    for (const key of ["showImages", "showSku", "showBrand"] as const) {
      if (input[key] !== undefined) {
        if (typeof input[key] !== "boolean") throw new BadRequestException("Valor inválido");
        data[key] = input[key];
      }
    }
    if (input.maxSellerDiscount !== undefined) {
      const max = input.maxSellerDiscount == null ? null : num(input.maxSellerDiscount);
      if (input.maxSellerDiscount != null && (max == null || max < 0 || max > 100)) {
        throw new BadRequestException("El descuento máximo va de 0 a 100 %");
      }
      data.maxSellerDiscount = max;
    }
    await this.prisma.quoteSettings.upsert({
      where: { tenantId },
      create: { ...(data as Prisma.QuoteSettingsUncheckedCreateInput), tenantId },
      update: data,
    });
    return this.get(tenantId);
  }

  /** Logo del PDF: se valida por sus bytes y reemplaza al anterior (que se borra). */
  async setLogo(tenantId: string, userId: string, file: { filename: string; buffer: Buffer } | null): Promise<QuoteSettingsView> {
    const current = await this.prisma.quoteSettings.findUnique({ where: { tenantId }, select: { logoUrl: true } });
    let logoUrl: string | null = null;
    if (file) {
      if (file.buffer.length === 0) throw new BadRequestException("El logo llegó vacío");
      if (file.buffer.length > MAX_IMAGE_BYTES) throw new BadRequestException("El logo pesa demasiado");
      const mime = sniffImage(file.buffer);
      if (!mime) throw new BadRequestException("Solo imágenes JPG, PNG o WebP");
      const asset = await this.prisma.storedAsset.create({
        data: {
          mimeType: mime,
          filename: `logo-presupuesto.${mime.split("/")[1]}`,
          byteSize: file.buffer.length,
          data: file.buffer,
          ownerTenantId: tenantId,
          purpose: QUOTE_LOGO_PURPOSE,
        },
        select: { id: true },
      });
      logoUrl = `/assets/${asset.id}`;
    }
    await this.prisma.quoteSettings.upsert({
      where: { tenantId },
      create: { tenantId, logoUrl, updatedById: userId },
      update: { logoUrl, updatedById: userId },
    });
    const oldId = current?.logoUrl ? assetIdOf(current.logoUrl) : null;
    if (oldId) {
      await this.prisma.storedAsset.deleteMany({ where: { id: oldId, ownerTenantId: tenantId, purpose: QUOTE_LOGO_PURPOSE } });
    }
    return this.get(tenantId);
  }
}

export function toView(row: QuoteSettings | null, tenantName: string): QuoteSettingsView {
  const theme = QUOTE_THEMES.find((t) => t === row?.theme) ?? "modern";
  const font = QUOTE_FONTS.find((f) => f === row?.font) ?? "sans";
  return {
    theme,
    accentColor: row?.accentColor && HEX.test(row.accentColor) ? row.accentColor : "#4f46e5",
    font,
    logoUrl: row?.logoUrl ?? null,
    businessName: row?.businessName ?? tenantName,
    taxId: row?.taxId ?? null,
    address: row?.address ?? null,
    phone: row?.phone ?? null,
    email: row?.email ?? null,
    website: row?.website ?? null,
    intro: row?.intro ?? null,
    terms: row?.terms ?? null,
    footer: row?.footer ?? null,
    validityDays: row?.validityDays ?? 7,
    numberPrefix: row?.numberPrefix ?? "P-",
    showImages: row?.showImages ?? true,
    showSku: row?.showSku ?? true,
    showBrand: row?.showBrand ?? true,
    priceDisplay: row?.priceDisplay === "NET" ? "NET" : "FINAL",
    maxSellerDiscount: num(row?.maxSellerDiscount),
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}
