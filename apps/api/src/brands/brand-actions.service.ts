import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BrandActionStatus, type BrandActionKind } from "@prisma/client";
import { TENANT_ROLES_CAN_MANAGE_PORTFOLIO } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";
import { actionProgress, sumMatchingLines } from "./brand-measure";
import { BrandNotificationsService } from "./brand-notifications.service";
import type { UpsertBrandActionDto } from "./dto/brand.dto";

const COUNTED = ["CREATED", "OFFLINE"];

@Injectable()
export class BrandActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notes: BrandNotificationsService
  ) {}

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

  async list(tenant: TenantContext) {
    this.assertBrand(tenant);
    const rows = await this.prisma.brandAction.findMany({
      where: { tenantId: tenant.tenantId },
      include: { scopes: true },
      orderBy: { startsAt: "desc" },
    });
    const withProgress = await Promise.all(rows.map((row) => this.withProgress(tenant, row)));
    return { canWrite: this.canWrite(tenant), actions: withProgress };
  }

  async get(tenant: TenantContext, actionId: string) {
    this.assertBrand(tenant);
    const row = await this.requireAction(tenant.tenantId, actionId);
    return this.withProgress(tenant, row);
  }

  async create(tenant: TenantContext, dto: UpsertBrandActionDto) {
    this.assertBrand(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés crear acciones");
    this.validateDto(dto);
    const row = await this.prisma.brandAction.create({
      data: {
        tenantId: tenant.tenantId,
        kind: dto.kind,
        status: dto.status ?? "DRAFT",
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        targetQty: dto.targetQty ?? null,
        targetAmountUsd: dto.targetAmountUsd ?? null,
        rewardKind: dto.rewardKind ?? "NONE",
        rewardUsd: dto.rewardUsd ?? null,
        notifyRetailers: dto.notifyRetailers ?? true,
        scopes: dto.scopes?.length
          ? { create: dto.scopes.map((s) => ({ kind: s.kind, refId: s.refId })) }
          : undefined,
      },
      include: { scopes: true },
    });
    if (row.status === "ACTIVE" && row.notifyRetailers) {
      await this.notifyLaunch(tenant, row);
    }
    return this.withProgress(tenant, row);
  }

  async update(tenant: TenantContext, actionId: string, dto: UpsertBrandActionDto) {
    this.assertBrand(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés editar acciones");
    this.validateDto(dto);
    const current = await this.requireAction(tenant.tenantId, actionId);
    const wasActive = current.status === "ACTIVE";
    await this.prisma.brandActionScope.deleteMany({ where: { actionId } });
    const row = await this.prisma.brandAction.update({
      where: { id: actionId },
      data: {
        kind: dto.kind,
        status: dto.status ?? current.status,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        targetQty: dto.targetQty ?? null,
        targetAmountUsd: dto.targetAmountUsd ?? null,
        rewardKind: dto.rewardKind ?? "NONE",
        rewardUsd: dto.rewardUsd ?? null,
        notifyRetailers: dto.notifyRetailers ?? current.notifyRetailers,
        scopes: dto.scopes?.length
          ? { create: dto.scopes.map((s) => ({ kind: s.kind, refId: s.refId })) }
          : undefined,
      },
      include: { scopes: true },
    });
    if (row.status === "ACTIVE" && row.notifyRetailers && !wasActive) {
      await this.notifyLaunch(tenant, row);
    }
    return this.withProgress(tenant, row);
  }

  async setStatus(tenant: TenantContext, actionId: string, status: BrandActionStatus) {
    this.assertBrand(tenant);
    if (!this.canWrite(tenant)) throw new ForbiddenException("No podés cambiar el estado");
    if (status === "DRAFT") throw new BadRequestException("Una acción activa no vuelve a borrador");
    const current = await this.requireAction(tenant.tenantId, actionId);
    const row = await this.prisma.brandAction.update({
      where: { id: actionId },
      data: { status },
      include: { scopes: true },
    });
    if (status === "ACTIVE" && current.status !== "ACTIVE" && row.notifyRetailers) {
      await this.notifyLaunch(tenant, row);
    }
    return this.withProgress(tenant, row);
  }

  async accounts(tenant: TenantContext) {
    this.assertBrand(tenant);
    const links = await this.prisma.tenantLink.findMany({
      where: { supplierTenantId: tenant.tenantId, status: { not: "REVOKED" } },
      include: {
        clientTenant: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const distros = await this.prisma.tenant.findMany({
      where: { type: "DISTRIBUTOR", active: true },
      select: { id: true, name: true, providerKey: true },
      orderBy: { name: "asc" },
    });
    return {
      retailers: links
        .filter((l) => l.clientTenant.type === "RETAILER")
        .map((l) => ({ linkId: l.id, tenantId: l.clientTenant.id, name: l.clientTenant.name, status: l.status })),
      distributors: distros,
    };
  }

  async visibleToRetailer(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") throw new ForbiddenException("Esto es del comercio");
    const links = await this.prisma.tenantLink.findMany({
      where: { clientTenantId: tenant.tenantId, status: { in: ["ACTIVE", "SUSPENDED"] }, supplierTenant: { type: "BRAND" } },
      include: {
        supplierTenant: {
          select: {
            id: true,
            name: true,
            brandLanding: { select: { publicKey: true, published: true, headline: true, logoUrl: true } },
          },
        },
      },
    });
    const brandIds = links.map((l) => l.supplierTenantId);
    const now = new Date();
    const actions = await this.prisma.brandAction.findMany({
      where: {
        tenantId: { in: brandIds },
        status: "ACTIVE",
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      include: { scopes: true },
    });
    const byBrand = new Map<string, typeof actions>();
    for (const action of actions) {
      const list = byBrand.get(action.tenantId) ?? [];
      list.push(action);
      byBrand.set(action.tenantId, list);
    }
    const brands = [];
    for (const link of links) {
      const org = link.supplierTenant;
      const mine = (byBrand.get(org.id) ?? []).filter((a) => this.actionTargetsRetailer(a, tenant.tenantId));
      const withP = await Promise.all(mine.map((row) => this.withProgressForRetailer(row, tenant.tenantId)));
      brands.push({
        linkId: link.id,
        tenantId: org.id,
        name: org.name,
        landing: org.brandLanding,
        actions: withP,
      });
    }
    return { brands };
  }

  private actionTargetsRetailer(
    action: { scopes: { kind: string; refId: string }[] },
    retailerId: string
  ) {
    const retailers = action.scopes.filter((s) => s.kind === "RETAILER").map((s) => s.refId);
    return retailers.length === 0 || retailers.includes(retailerId);
  }

  private async requireAction(tenantId: string, actionId: string) {
    const row = await this.prisma.brandAction.findFirst({
      where: { id: actionId, tenantId },
      include: { scopes: true },
    });
    if (!row) throw new NotFoundException("Acción no encontrada");
    return row;
  }

  private validateDto(dto: UpsertBrandActionDto) {
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new BadRequestException("La fecha de fin tiene que ser después del inicio");
    }
    if (dto.kind === "PURCHASE_AMOUNT" && !(dto.targetAmountUsd && dto.targetAmountUsd > 0)) {
      throw new BadRequestException("Falta el objetivo en USD");
    }
    if ((dto.kind === "PURCHASE_QTY" || dto.kind === "REBATE") && !(dto.targetQty && dto.targetQty > 0)) {
      throw new BadRequestException("Falta la cantidad objetivo");
    }
    if ((dto.rewardKind === "FLAT" || dto.rewardKind === "PER_UNIT") && !(dto.rewardUsd && dto.rewardUsd > 0)) {
      throw new BadRequestException("Falta el importe del rebate");
    }
  }

  private async brandNames(tenantId: string): Promise<string[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        catalogTerm: { select: { label: true, aliases: { select: { label: true, rawKey: true } } } },
      },
    });
    const names = [tenant?.name, tenant?.catalogTerm?.label];
    for (const alias of tenant?.catalogTerm?.aliases ?? []) {
      names.push(alias.label, alias.rawKey);
    }
    return [...new Set(names.filter((n): n is string => Boolean(n?.trim())))];
  }

  private async withProgress(
    tenant: TenantContext,
    row: Awaited<ReturnType<BrandActionsService["requireAction"]>>
  ) {
    const retailerIds = await this.retailerIdsFor(tenant.tenantId, row);
    const progress = await this.measure(row, retailerIds);
    return { ...this.serialize(row), progress };
  }

  private async withProgressForRetailer(
    row: Awaited<ReturnType<BrandActionsService["requireAction"]>>,
    retailerId: string
  ) {
    const progress = await this.measure(row, [retailerId]);
    return { ...this.serialize(row), progress };
  }

  private async retailerIdsFor(
    brandTenantId: string,
    row: { scopes: { kind: string; refId: string }[] }
  ) {
    const scoped = row.scopes.filter((s) => s.kind === "RETAILER").map((s) => s.refId);
    if (scoped.length) return scoped;
    const links = await this.prisma.tenantLink.findMany({
      where: { supplierTenantId: brandTenantId, status: { in: ["ACTIVE", "SUSPENDED"] } },
      select: { clientTenantId: true },
    });
    return links.map((l) => l.clientTenantId);
  }

  private async measure(
    row: {
      tenantId: string;
      kind: BrandActionKind;
      startsAt: Date;
      endsAt: Date;
      targetQty: { toNumber?: () => number } | number | null;
      targetAmountUsd: { toNumber?: () => number } | number | null;
      scopes: { kind: string; refId: string }[];
    },
    retailerIds: string[]
  ) {
    const num = (v: { toNumber?: () => number } | number | null | undefined) => {
      if (v == null) return null;
      if (typeof v === "number") return v;
      return v.toNumber?.() ?? Number(v);
    };
    if (retailerIds.length === 0) {
      return actionProgress({
        kind: row.kind,
        targetQty: num(row.targetQty),
        targetAmountUsd: num(row.targetAmountUsd),
        qty: 0,
        spendUsd: 0,
      });
    }
    const distroIds = row.scopes.filter((s) => s.kind === "DISTRIBUTOR").map((s) => s.refId);
    const productKeys = row.scopes.filter((s) => s.kind === "PRODUCT").map((s) => s.refId);
    let providers: string[] = [];
    if (distroIds.length) {
      const distros = await this.prisma.tenant.findMany({
        where: { id: { in: distroIds }, type: "DISTRIBUTOR" },
        select: { providerKey: true },
      });
      providers = distros.map((d) => d.providerKey).filter((k): k is string => Boolean(k));
    }
    const brandNames = await this.brandNames(row.tenantId);
    const orders = await this.prisma.providerOrder.findMany({
      where: {
        tenantId: { in: retailerIds },
        status: { in: COUNTED },
        createdAt: { gte: row.startsAt, lte: row.endsAt },
        ...(providers.length ? { provider: { in: providers } } : {}),
      },
      select: { provider: true, items: true },
    });
    const sums = sumMatchingLines(orders, { brandNames, providers, productKeys });
    return actionProgress({
      kind: row.kind,
      targetQty: num(row.targetQty),
      targetAmountUsd: num(row.targetAmountUsd),
      qty: sums.qty,
      spendUsd: sums.spendUsd,
    });
  }

  private serialize(row: Awaited<ReturnType<BrandActionsService["requireAction"]>>) {
    const num = (v: { toNumber?: () => number } | number | null | undefined) => {
      if (v == null) return null;
      if (typeof v === "number") return v;
      return v.toNumber?.() ?? Number(v);
    };
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      description: row.description,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      targetQty: num(row.targetQty),
      targetAmountUsd: num(row.targetAmountUsd),
      rewardKind: row.rewardKind,
      rewardUsd: num(row.rewardUsd),
      notifyRetailers: row.notifyRetailers,
      scopes: row.scopes.map((s) => ({ kind: s.kind, refId: s.refId })),
    };
  }

  private async notifyLaunch(
    tenant: TenantContext,
    row: Awaited<ReturnType<BrandActionsService["requireAction"]>>
  ) {
    const retailerIds = await this.retailerIdsFor(tenant.tenantId, row);
    const landing = await this.prisma.brandLanding.findUnique({ where: { tenantId: tenant.tenantId } });
    const reward =
      row.rewardKind !== "NONE" && row.rewardUsd
        ? ` Rebate: ${Number(row.rewardUsd)} USD${row.rewardKind === "PER_UNIT" ? " por unidad" : ""}.`
        : "";
    await this.notes.notifyMany({
      toTenantIds: retailerIds,
      fromTenantId: tenant.tenantId,
      kind: "BRAND_ACTION",
      title: row.title,
      body: `${row.description ?? "Nueva acción de la marca."}${reward}`,
      actionId: row.id,
      landingKey: landing?.published ? landing.publicKey : null,
    });
  }
}
