import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PcBuild } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import type { PcBuilderSettingsDto, SavePcBuildDto } from "./dto/pc-builder.dto";

type Viewer = Pick<TenantContext, "tenantId" | "userId" | "tenantRole">;

/** Tope de armados guardados por comercio (los viejos se borran a mano). */
export const MAX_PC_BUILDS = 500;
/** Un armado es chico (ids, cantidades): más que esto es un error o un abuso. */
const MAX_DATA_BYTES = 200_000;

/** Dueño y admin ven y cambian los armados de todo el equipo; el resto, los suyos. */
export function seesAllBuilds(viewer: Pick<TenantContext, "tenantRole">): boolean {
  return viewer.tenantRole === "OWNER" || viewer.tenantRole === "ADMIN";
}

export interface PcBuildView {
  id: string;
  title: string;
  clientName: string | null;
  template: boolean;
  data: unknown;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  mine: boolean;
}

/**
 * Armados de PC guardados del comercio, para retomarlos desde cualquier compu,
 * y plantillas que todo el equipo usa de punto de partida.
 */
@Injectable()
export class PcBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  async list(viewer: Viewer): Promise<Omit<PcBuildView, "data">[]> {
    const rows = await this.prisma.pcBuild.findMany({
      where: {
        tenantId: viewer.tenantId,
        ...(seesAllBuilds(viewer) ? {} : { OR: [{ template: true }, { createdById: viewer.userId }] }),
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_PC_BUILDS,
      select: { id: true, title: true, clientName: true, template: true, createdById: true, createdAt: true, updatedAt: true },
    });
    return rows.map((r) => ({ ...r, mine: r.createdById === viewer.userId }));
  }

  async get(viewer: Viewer, id: string): Promise<PcBuildView> {
    return this.view(viewer, await this.visible(viewer, id));
  }

  async create(viewer: Viewer, dto: SavePcBuildDto): Promise<PcBuildView> {
    this.assertData(dto.data);
    if (dto.template) this.assertManager(viewer);
    const count = await this.prisma.pcBuild.count({ where: { tenantId: viewer.tenantId } });
    if (count >= MAX_PC_BUILDS) {
      throw new BadRequestException(`Llegaste a ${MAX_PC_BUILDS} armados guardados: borrá los que ya no uses`);
    }
    const row = await this.prisma.pcBuild.create({
      data: {
        tenantId: viewer.tenantId,
        createdById: viewer.userId,
        title: dto.title,
        clientName: dto.clientName ?? null,
        template: Boolean(dto.template),
        data: dto.data as Prisma.InputJsonValue,
      },
    });
    return this.view(viewer, row);
  }

  async update(viewer: Viewer, id: string, dto: SavePcBuildDto): Promise<PcBuildView> {
    this.assertData(dto.data);
    const row = await this.editable(viewer, id);
    if (dto.template !== undefined && dto.template !== row.template) this.assertManager(viewer);
    const saved = await this.prisma.pcBuild.update({
      where: { id: row.id },
      data: {
        title: dto.title,
        clientName: dto.clientName ?? null,
        ...(dto.template !== undefined ? { template: dto.template } : {}),
        data: dto.data as Prisma.InputJsonValue,
      },
    });
    return this.view(viewer, saved);
  }

  async remove(viewer: Viewer, id: string): Promise<{ deleted: true }> {
    const row = await this.editable(viewer, id);
    await this.prisma.pcBuild.delete({ where: { id: row.id } });
    return { deleted: true };
  }

  async settings(tenantId: string) {
    const row = await this.prisma.pcBuilderSettings.findUnique({ where: { tenantId } });
    return {
      laborName: row?.laborName ?? null,
      laborPrice: row?.laborPrice != null ? Number(row.laborPrice) : null,
      laborIva: row ? Number(row.laborIva) : 21,
    };
  }

  async updateSettings(viewer: Viewer, dto: PcBuilderSettingsDto) {
    if (!seesAllBuilds(viewer)) throw new ForbiddenException("Lo que se cobra por armar lo cambian el dueño o un administrador.");
    const data = {
      ...(dto.laborName !== undefined ? { laborName: dto.laborName } : {}),
      ...(dto.laborPrice !== undefined ? { laborPrice: dto.laborPrice } : {}),
      ...(dto.laborIva !== undefined ? { laborIva: dto.laborIva } : {}),
    };
    await this.prisma.pcBuilderSettings.upsert({
      where: { tenantId: viewer.tenantId },
      create: { tenantId: viewer.tenantId, ...data },
      update: data,
    });
    return this.settings(viewer.tenantId);
  }

  private assertData(data: unknown) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new BadRequestException("Armado inválido");
    if (Buffer.byteLength(JSON.stringify(data)) > MAX_DATA_BYTES) throw new BadRequestException("El armado es demasiado grande");
  }

  private assertManager(viewer: Viewer) {
    if (!seesAllBuilds(viewer)) throw new ForbiddenException("Las plantillas las crean el dueño o un administrador.");
  }

  /** Lo puede abrir: es del comercio y es suyo, es una plantilla, o quien mira es dueño/admin. */
  private async visible(viewer: Viewer, id: string): Promise<PcBuild> {
    const row = await this.prisma.pcBuild.findUnique({ where: { id } });
    if (!row || row.tenantId !== viewer.tenantId) throw new NotFoundException("Armado no encontrado");
    if (!row.template && row.createdById !== viewer.userId && !seesAllBuilds(viewer)) {
      throw new NotFoundException("Armado no encontrado");
    }
    return row;
  }

  /** Lo puede cambiar o borrar: es suyo, o quien mira es dueño/admin (las plantillas, solo ellos). */
  private async editable(viewer: Viewer, id: string): Promise<PcBuild> {
    const row = await this.visible(viewer, id);
    if (!seesAllBuilds(viewer) && (row.template || row.createdById !== viewer.userId)) {
      throw new ForbiddenException("Este armado no lo podés cambiar: guardá una copia");
    }
    return row;
  }

  private view(viewer: Viewer, row: PcBuild): PcBuildView {
    return {
      id: row.id,
      title: row.title,
      clientName: row.clientName,
      template: row.template,
      data: row.data,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      mine: row.createdById === viewer.userId,
    };
  }
}
