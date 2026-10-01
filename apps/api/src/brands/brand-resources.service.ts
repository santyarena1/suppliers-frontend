import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { hasPermission } from "../tenants/tenant-roles";
import { assetIdFromUrl, signIfAsset } from "../assets/asset-signing";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import type { UpsertBrandResourceDto } from "./dto/brand.dto";

const MATERIAL_TYPES = [
  "BANNER",
  "IMAGE",
  "DATASHEET",
  "CATALOG",
  "VIDEO",
  "PROMOTION",
  "PRESENTATION",
  "MANUAL",
  "WARRANTY",
  "COMMERCIAL",
];
const TRAINING_TYPES = ["VIDEO", "LINK", "PDF", "COURSE", "SALES_PITCH", "CERTIFICATION"];

@Injectable()
export class BrandResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  assertBrand(tenant: TenantContext) {
    if (tenant.tenantType !== "BRAND") throw new ForbiddenException("Esto es del panel de marca");
  }

  canWrite(tenant: TenantContext) {
    return hasPermission(tenant, "brand.manage");
  }

  async list(tenant: TenantContext, kind?: "MATERIAL" | "TRAINING") {
    this.assertBrand(tenant);
    const rows = await this.prisma.brandResource.findMany({
      where: { tenantId: tenant.tenantId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return { canWrite: this.canWrite(tenant), resources: rows.map(withSignedFile) };
  }

  async create(tenant: TenantContext, dto: UpsertBrandResourceDto) {
    this.assertBrand(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés cargar archivos");
    this.validate(dto);
    const row = await this.prisma.brandResource.create({
      data: {
        tenantId: tenant.tenantId,
        kind: dto.kind,
        type: dto.type,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        fileUrl: dto.fileUrl?.split("?")[0].trim() || null,
        contentUrl: dto.contentUrl?.trim() || null,
        isPublic: dto.isPublic ?? true,
      },
    });
    await this.syncFilePrivacy(tenant.tenantId, row.fileUrl, row.isPublic);
    return withSignedFile(row);
  }

  /** Si el archivo se descarga desde el link público o queda solo para vinculados. */
  async setVisibility(tenant: TenantContext, id: string, isPublic: boolean) {
    this.assertBrand(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés editar archivos");
    const updated = await this.prisma.brandResource.updateMany({
      where: { id, tenantId: tenant.tenantId },
      data: { isPublic },
    });
    if (updated.count === 0) throw new NotFoundException("Archivo no encontrado");
    const row = await this.prisma.brandResource.findUnique({ where: { id } });
    if (row) await this.syncFilePrivacy(tenant.tenantId, row.fileUrl, row.isPublic);
    return row ? withSignedFile(row) : row;
  }

  /**
   * "Solo vinculados" vale también para el archivo: deja de servirse sin link
   * firmado. Solo toca archivos sin dueño (recién subidos) o de esta marca.
   */
  private async syncFilePrivacy(tenantId: string, fileUrl: string | null, isPublic: boolean) {
    const assetId = assetIdFromUrl(fileUrl);
    if (!assetId) return;
    await this.prisma.storedAsset.updateMany({
      where: { id: assetId, OR: [{ ownerTenantId: null }, { ownerTenantId: tenantId }] },
      data: { isPrivate: !isPublic, ownerTenantId: tenantId },
    });
  }

  async remove(tenant: TenantContext, id: string) {
    this.assertBrand(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés borrar archivos");
    const deleted = await this.prisma.brandResource.deleteMany({ where: { id, tenantId: tenant.tenantId } });
    if (!deleted.count) throw new NotFoundException("Archivo no encontrado");
    return { ok: true };
  }

  private validate(dto: UpsertBrandResourceDto) {
    const types = dto.kind === "TRAINING" ? TRAINING_TYPES : MATERIAL_TYPES;
    if (!types.includes(dto.type)) throw new BadRequestException("Tipo inválido");
    if (!dto.fileUrl?.trim() && !dto.contentUrl?.trim()) {
      throw new BadRequestException("Falta el archivo o el link");
    }
  }
}

/** El archivo del material, con link firmado si es de NODO. */
function withSignedFile<T extends { fileUrl: string | null }>(row: T): T {
  return { ...row, fileUrl: signIfAsset(row.fileUrl) };
}
