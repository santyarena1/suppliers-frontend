import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { BrandSignalLight } from "@prisma/client";
import { type Provider, isProviderKey, providerLabel } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { TENANT_ROLES_CAN_MANAGE_PORTFOLIO } from "@nodo/shared";
import { brandFieldMatches, brandMatchNames } from "./brand-names";
import type { UpsertBrandSignalDto } from "./dto/brand.dto";

const LIGHTS = ["GREEN", "YELLOW", "RED", "BLUE", "GRAY"] as const;

@Injectable()
export class BrandCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  assertBrand(tenant: TenantContext) {
    if (tenant.tenantType !== "BRAND") throw new ForbiddenException("Esto es del panel de marca");
  }

  canWrite(tenant: TenantContext) {
    return (
      tenant.tenantRole === "COMMERCIAL" ||
      tenant.tenantRole === "MARKETING" ||
      TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(tenant.tenantRole)
    );
  }

  async searchCatalog(tenant: TenantContext, q: string, provider?: string, take = 40) {
    this.assertBrand(tenant);
    const names = await brandMatchNames(this.prisma, tenant.tenantId);
    if (names.length === 0) return { canWrite: this.canWrite(tenant), products: [] };
    const needle = q.trim();
    const providerFilter = provider && isProviderKey(provider) ? provider : undefined;
    const orBrand = names.map((name) => ({ brand: { equals: name, mode: "insensitive" as const } }));
    const textFilter = needle
      ? {
          OR: [
            { name: { contains: needle, mode: "insensitive" as const } },
            { sku: { contains: needle, mode: "insensitive" as const } },
            { externalId: { contains: needle, mode: "insensitive" as const } },
          ],
        }
      : null;
    const rows = await this.prisma.providerSyncCache.findMany({
      where: {
        AND: [
          ...(providerFilter ? [{ provider: providerFilter }] : []),
          { OR: orBrand },
          ...(textFilter ? [textFilter] : []),
        ],
      },
      select: {
        provider: true,
        externalId: true,
        name: true,
        brand: true,
        sku: true,
        imageUrl: true,
      },
      take: Math.min(Math.max(take, 1), 80),
      orderBy: { name: "asc" },
    });
    const overrideByName = await this.prisma.platformProductCatalogOverride.findMany({
      where: {
        OR: names.map((name) => ({ displayBrand: { equals: name, mode: "insensitive" as const } })),
      },
      select: { provider: true, externalId: true, displayBrand: true },
      take: 80,
    });
    const have = new Set(rows.map((row) => `${row.provider}:${row.externalId}`));
    const missing = overrideByName.filter(
      (row) =>
        !have.has(`${row.provider}:${row.externalId}`) &&
        (!providerFilter || row.provider === providerFilter)
    );
    const extra =
      missing.length === 0
        ? []
        : await this.prisma.providerSyncCache.findMany({
            where: {
              AND: [
                { OR: missing.map((row) => ({ provider: row.provider, externalId: row.externalId })) },
                ...(textFilter ? [textFilter] : []),
              ],
            },
            select: {
              provider: true,
              externalId: true,
              name: true,
              brand: true,
              sku: true,
              imageUrl: true,
            },
            take: 80,
            orderBy: { name: "asc" },
          });
    const allRows = [...rows, ...extra];
    const overrides = allRows.length
      ? await this.prisma.platformProductCatalogOverride.findMany({
          where: {
            OR: allRows.map((row) => ({ provider: row.provider, externalId: row.externalId })),
          },
          select: { provider: true, externalId: true, displayBrand: true },
        })
      : [];
    const overrideKey = new Map(overrides.map((o) => [`${o.provider}:${o.externalId}`, o.displayBrand]));
    const selected = await this.prisma.brandSkuSignal.findMany({
      where: { tenantId: tenant.tenantId },
      select: { provider: true, externalId: true },
    });
    const picked = new Set(selected.map((s) => `${s.provider}:${s.externalId}`));
    const products = allRows
      .filter((row) => {
        const display = overrideKey.get(`${row.provider}:${row.externalId}`) ?? row.brand;
        return brandFieldMatches(display, names) || brandFieldMatches(row.brand, names);
      })
      .map((row) => ({
        provider: row.provider,
        providerName: providerLabel(row.provider as Provider) ?? row.provider,
        externalId: row.externalId,
        name: row.name,
        sku: row.sku,
        imageUrl: row.imageUrl,
        selected: picked.has(`${row.provider}:${row.externalId}`),
      }));
    return { canWrite: this.canWrite(tenant), products };
  }

  async listSignals(tenant: TenantContext) {
    this.assertBrand(tenant);
    const rows = await this.prisma.brandSkuSignal.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: [{ light: "asc" }, { name: "asc" }],
    });
    return { canWrite: this.canWrite(tenant), signals: rows.map((row) => this.serialize(row)) };
  }

  async upsertSignal(tenant: TenantContext, dto: UpsertBrandSignalDto) {
    this.assertBrand(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés marcar productos");
    if (!isProviderKey(dto.provider)) {
      throw new BadRequestException("Ese distribuidor no existe");
    }
    const product = await this.prisma.providerSyncCache.findUnique({
      where: { provider_externalId: { provider: dto.provider, externalId: dto.externalId } },
    });
    if (!product) throw new NotFoundException("Ese producto no está en el catálogo de ningún distro");
    const names = await brandMatchNames(this.prisma, tenant.tenantId);
    const override = await this.prisma.platformProductCatalogOverride.findUnique({
      where: { provider_externalId: { provider: dto.provider, externalId: dto.externalId } },
    });
    if (!brandFieldMatches(override?.displayBrand ?? product.brand, names)) {
      throw new BadRequestException("Ese SKU no es de esta marca");
    }
    const light = (dto.light ?? "YELLOW") as BrandSignalLight;
    if (!LIGHTS.includes(light)) throw new BadRequestException("Semáforo inválido");
    const row = await this.prisma.brandSkuSignal.upsert({
      where: {
        tenantId_provider_externalId: {
          tenantId: tenant.tenantId,
          provider: dto.provider,
          externalId: dto.externalId,
        },
      },
      create: {
        tenantId: tenant.tenantId,
        provider: dto.provider,
        externalId: dto.externalId,
        name: product.name,
        sku: product.sku,
        imageUrl: product.imageUrl,
        light,
        suggestedPrice: dto.suggestedPrice ?? null,
        qtyEstimate: dto.qtyEstimate ?? null,
        incomingAt: dto.incomingAt ? new Date(dto.incomingAt) : null,
        notes: dto.notes?.trim() || null,
      },
      update: {
        name: product.name,
        sku: product.sku,
        imageUrl: product.imageUrl,
        ...(dto.light ? { light } : {}),
        ...(dto.suggestedPrice !== undefined ? { suggestedPrice: dto.suggestedPrice } : {}),
        ...(dto.qtyEstimate !== undefined ? { qtyEstimate: dto.qtyEstimate } : {}),
        ...(dto.incomingAt !== undefined ? { incomingAt: dto.incomingAt ? new Date(dto.incomingAt) : null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });
    return this.serialize(row);
  }

  async removeSignal(tenant: TenantContext, id: string) {
    this.assertBrand(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés sacar productos del mapa");
    const deleted = await this.prisma.brandSkuSignal.deleteMany({ where: { id, tenantId: tenant.tenantId } });
    if (!deleted.count) throw new NotFoundException("Ese SKU no está en el mapa");
    return { ok: true };
  }

  async importCsv(tenant: TenantContext, csv: string) {
    this.assertBrand(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés importar");
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) throw new BadRequestException("El archivo no tiene filas");
    const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idx = (name: string, aliases: string[] = []) =>
      header.findIndex((h) => h === name || aliases.includes(h));
    const colProvider = idx("provider", ["proveedor", "distribuidor"]);
    const colExternal = idx("externalid", ["external_id", "sku_proveedor", "id"]);
    const colSku = idx("sku");
    const colLight = idx("light", ["semaforo", "semáforo", "estado"]);
    const colPrice = idx("suggestedprice", ["precio_sugerido", "precio"]);
    const colNotes = idx("notes", ["notas", "observaciones"]);
    if (colProvider < 0 || (colExternal < 0 && colSku < 0)) {
      throw new BadRequestException("Faltan columnas provider y externalId (o sku)");
    }
    let upserted = 0;
    let skipped = 0;
    for (const line of lines.slice(1)) {
      const cols = splitCsvLine(line);
      const provider = (cols[colProvider] ?? "").trim().toUpperCase().replace(/\s+/g, "_");
      const externalId = (colExternal >= 0 ? cols[colExternal] : "").trim() || (colSku >= 0 ? cols[colSku] : "").trim();
      if (!provider || !externalId) {
        skipped += 1;
        continue;
      }
      const lightRaw = (colLight >= 0 ? cols[colLight] : "YELLOW").trim().toUpperCase();
      const light = parseLight(lightRaw);
      const priceRaw = colPrice >= 0 ? cols[colPrice] : "";
      const suggestedPrice = priceRaw ? Number(String(priceRaw).replace(",", ".")) : null;
      try {
        await this.upsertSignal(tenant, {
          provider,
          externalId,
          light,
          suggestedPrice: Number.isFinite(suggestedPrice) ? suggestedPrice : null,
          notes: colNotes >= 0 ? cols[colNotes] : null,
        });
        upserted += 1;
      } catch {
        skipped += 1;
      }
    }
    return { upserted, skipped };
  }

  private serialize(row: {
    id: string;
    provider: string;
    externalId: string;
    name: string;
    sku: string | null;
    imageUrl: string | null;
    light: BrandSignalLight;
    suggestedPrice: { toNumber?: () => number } | number | null;
    qtyEstimate: number | null;
    incomingAt: Date | null;
    notes: string | null;
  }) {
    const price =
      row.suggestedPrice == null
        ? null
        : typeof row.suggestedPrice === "number"
          ? row.suggestedPrice
          : row.suggestedPrice.toNumber?.() ?? Number(row.suggestedPrice);
    return {
      id: row.id,
      provider: row.provider,
      providerName: providerLabel(row.provider as Provider) ?? row.provider,
      externalId: row.externalId,
      name: row.name,
      sku: row.sku,
      imageUrl: row.imageUrl,
      light: row.light,
      suggestedPrice: price,
      qtyEstimate: row.qtyEstimate,
      incomingAt: row.incomingAt?.toISOString() ?? null,
      notes: row.notes,
    };
  }
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if ((ch === "," || ch === ";") && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseLight(raw: string): BrandSignalLight {
  if (LIGHTS.includes(raw as BrandSignalLight)) return raw as BrandSignalLight;
  if (raw.includes("GREEN") || raw.includes("ALTO") || raw.includes("HAY")) return "GREEN";
  if (raw.includes("RED") || raw.includes("SIN") || raw.includes("OUT")) return "RED";
  if (raw.includes("BLUE") || raw.includes("INGRESO") || raw.includes("INCOMING")) return "BLUE";
  if (raw.includes("GRAY") || raw.includes("DISCONTIN")) return "GRAY";
  return "YELLOW";
}
