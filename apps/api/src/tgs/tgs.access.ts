import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenants/tenant-context.service";

const CACHE_MS = 60_000;
export const DEFAULT_TGS_USERNAME = "testuser1";

/**
 * SISTEMA TGS solo existe para la organización de `testuser1` (o
 * TGS_ALLOWED_USERNAME / TGS_ALLOWED_TENANT_ID). El superadmin de
 * Administración no lo ve: tiene que entrar como ese comercio.
 */
@Injectable()
export class TgsAccessService {
  private cache: { tenantId: string | null; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async allowedTenantId(): Promise<string | null> {
    const pinned = this.config.get<string>("TGS_ALLOWED_TENANT_ID")?.trim();
    if (pinned) return pinned;

    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.tenantId;

    const username = this.config.get<string>("TGS_ALLOWED_USERNAME")?.trim() || DEFAULT_TGS_USERNAME;
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        memberships: {
          where: { active: true, tenant: { active: true } },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { tenantId: true },
        },
      },
    });
    const tenantId = user?.memberships[0]?.tenantId ?? null;
    this.cache = { tenantId, expiresAt: now + CACHE_MS };
    return tenantId;
  }

  async isAllowed(tenant: TenantContext | null | undefined): Promise<boolean> {
    if (!tenant) return false;
    const allowed = await this.allowedTenantId();
    return Boolean(allowed && tenant.tenantId === allowed);
  }

  async assertAllowed(tenant: TenantContext): Promise<void> {
    if (await this.isAllowed(tenant)) return;
    throw new ForbiddenException("SISTEMA TGS no está disponible para tu organización.");
  }
}
