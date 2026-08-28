import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TENANT_ROLES_CAN_MANAGE_PORTFOLIO } from "@nodo/shared";
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
    return (
      tenant.tenantRole === "COMMERCIAL" ||
      tenant.tenantRole === "MARKETING" ||
      TENANT_ROLES_CAN_MANAGE_PORTFOLIO.includes(tenant.tenantRole)
    );
  }

  async list(tenant: TenantContext, kind?: "MATERIAL" | "TRAINING") {
    this.assertBrand(tenant);
    const rows = await this.prisma.brandResource.findMany({
      where: { tenantId: tenant.tenantId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return { canWrite: this.canWrite(tenant), resources: rows };
  }

  async create(tenant: TenantContext, dto: UpsertBrandResourceDto) {
    this.assertBrand(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés cargar archivos");
    this.validate(dto);
    return this.prisma.brandResource.create({
      data: {
        tenantId: tenant.tenantId,
        kind: dto.kind,
        type: dto.type,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        fileUrl: dto.fileUrl?.trim() || null,
        contentUrl: dto.contentUrl?.trim() || null,
      },
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
