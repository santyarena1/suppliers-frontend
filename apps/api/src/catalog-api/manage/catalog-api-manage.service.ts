import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ApiClient } from "@prisma/client";
import {
  resolveApiClientConfig,
  type ApiClientView,
  type CatalogApiOverview,
  type CatalogApiScope,
} from "@nodo/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { SubscriptionsService } from "../../subscriptions/subscriptions.service";
import { hasPermission } from "../../tenants/tenant-roles";
import { commercialId, type TenantContext } from "../../tenants/tenant-context.service";
import { TenantVisibilityService } from "../../tenants/tenant-visibility.service";
import { ApiClientResolver } from "../auth/api-client-resolver.service";
import { hashSecret, last4, newFeedToken, newPublicKey, newSecret } from "../auth/api-key-crypto";
import { CatalogSnapshotService } from "../core/catalog-snapshot.service";
import { docsUrl, publicApiUrl } from "../core/public-urls";
import { WebhooksService } from "../webhooks/webhooks.service";
import { ConfigInputError, parseConfigInput, parseIpAllowlist, parseScopes } from "./config-input";

export const MAX_KEYS_PER_TENANT = 20;
/** Al rotar, el secret anterior sigue valiendo esto para cambiar sin cortes. */
export const PREVIOUS_SECRET_GRACE_MS = 24 * 3_600_000;
const USAGE_MAX_DAYS = 90;

export interface ClientInput {
  name?: string;
  scopes?: unknown;
  config?: unknown;
  ipAllowlist?: unknown;
  expiresAt?: string | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function feedUrls(feedToken: string) {
  const base = `${publicApiUrl()}/v1/feeds/${feedToken}`;
  return { google: `${base}/google.xml`, meta: `${base}/meta.csv` };
}

export function clientView(c: ApiClient): ApiClientView {
  return {
    id: c.id,
    name: c.name,
    publicKey: c.publicKey,
    secretLast4: c.secretLast4,
    feedToken: c.feedToken,
    status: c.status,
    scopes: c.scopes as CatalogApiScope[],
    config: resolveApiClientConfig(c.config),
    ipAllowlist: c.ipAllowlist,
    rateLimitPerMinute: c.rateLimitPerMinute,
    lastUsedAt: iso(c.lastUsedAt),
    lastUsedIp: c.lastUsedIp,
    expiresAt: iso(c.expiresAt),
    createdAt: c.createdAt.toISOString(),
    revokedAt: iso(c.revokedAt),
    feeds: feedUrls(c.feedToken),
  };
}

/**
 * Configuración → API de catálogo: el módulo, las keys y sus webhooks. Lo
 * maneja el dueño o quien tenga el permiso «API de catálogo» (integrations.manage).
 */
@Injectable()
export class CatalogApiManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly visibility: TenantVisibilityService,
    private readonly resolver: ApiClientResolver,
    private readonly webhooks: WebhooksService,
    private readonly snapshots: CatalogSnapshotService
  ) {}

  canManage(tenant: TenantContext): boolean {
    return tenant.tenantType === "RETAILER" && (tenant.tenantRole === "OWNER" || hasPermission(tenant, "integrations.manage"));
  }

  private assertManage(tenant: TenantContext) {
    if (tenant.tenantType !== "RETAILER") throw new NotFoundException("La API de catálogo es para comercios");
    if (!this.canManage(tenant)) throw new ForbiddenException("No tenés permiso para administrar la API de catálogo. Pedíselo al dueño.");
  }

  async overview(tenant: TenantContext): Promise<CatalogApiOverview> {
    if (tenant.tenantType !== "RETAILER") throw new NotFoundException("La API de catálogo es para comercios");
    const canManage = this.canManage(tenant);
    const [addon, clients, providers] = await Promise.all([
      this.subscriptions.catalogApiAddon(tenant.tenantId),
      canManage
        ? this.prisma.apiClient.findMany({ where: { tenantId: tenant.tenantId }, orderBy: [{ status: "asc" }, { createdAt: "asc" }] })
        : Promise.resolve([]),
      this.connectedProviders(tenant),
    ]);
    return {
      addon,
      canManage,
      clients: clients.map(clientView),
      providers,
      docsUrl: docsUrl(),
      baseUrl: publicApiUrl(),
    };
  }

  async setAddon(tenant: TenantContext, enabled: boolean) {
    this.assertManage(tenant);
    // Cambiar lo que se cobra es del dueño o de un administrador.
    if (tenant.tenantRole !== "OWNER" && tenant.tenantRole !== "ADMIN") {
      throw new ForbiddenException("Solo el dueño o un administrador puede activar o desactivar el módulo");
    }
    const addon = await this.subscriptions.setCatalogApiAddon({ userId: tenant.userId }, tenant.tenantId, enabled, { fromTenant: tenant });
    this.resolver.invalidate();
    return { addon };
  }

  async create(tenant: TenantContext, input: ClientInput) {
    this.assertManage(tenant);
    const addon = await this.subscriptions.catalogApiAddon(tenant.tenantId);
    if (!addon.enabled) throw new BadRequestException("Activá el módulo de API de catálogo para crear keys");
    const active = await this.prisma.apiClient.count({ where: { tenantId: tenant.tenantId, status: "ACTIVE" } });
    if (active >= MAX_KEYS_PER_TENANT) throw new BadRequestException(`Hasta ${MAX_KEYS_PER_TENANT} keys activas por organización`);
    const parsed = await this.parse(tenant, input, null);
    const secret = newSecret();
    const client = await this.prisma.apiClient.create({
      data: {
        tenantId: tenant.tenantId,
        name: parsed.name ?? "API key",
        publicKey: newPublicKey(),
        secretHash: hashSecret(secret),
        secretLast4: last4(secret),
        feedToken: newFeedToken(),
        config: parsed.config as object,
        scopes: parsed.scopes,
        ipAllowlist: parsed.ipAllowlist,
        expiresAt: parsed.expiresAt ?? null,
        createdById: tenant.userId,
      },
    });
    return { client: clientView(client), secret };
  }

  async update(tenant: TenantContext, id: string, input: ClientInput) {
    const current = await this.own(tenant, id);
    const parsed = await this.parse(tenant, input, current);
    const client = await this.prisma.apiClient.update({
      where: { id },
      data: {
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(input.config !== undefined ? { config: parsed.config as object } : {}),
        ...(input.scopes !== undefined ? { scopes: parsed.scopes } : {}),
        ...(input.ipAllowlist !== undefined ? { ipAllowlist: parsed.ipAllowlist } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: parsed.expiresAt ?? null } : {}),
      },
    });
    this.resolver.invalidate(client.publicKey, client.feedToken);
    return { client: clientView(client) };
  }

  async rotate(tenant: TenantContext, id: string) {
    const current = await this.own(tenant, id);
    if (current.status !== "ACTIVE") throw new BadRequestException("La key está revocada");
    const secret = newSecret();
    const previousValidUntil = new Date(Date.now() + PREVIOUS_SECRET_GRACE_MS);
    const client = await this.prisma.apiClient.update({
      where: { id },
      data: {
        secretHash: hashSecret(secret),
        secretLast4: last4(secret),
        previousSecretHash: current.secretHash,
        previousSecretExpiresAt: previousValidUntil,
      },
    });
    this.resolver.invalidate(client.publicKey, client.feedToken);
    return { client: clientView(client), secret, previousValidUntil: previousValidUntil.toISOString() };
  }

  async revoke(tenant: TenantContext, id: string) {
    const current = await this.own(tenant, id);
    const client =
      current.status === "REVOKED"
        ? current
        : await this.prisma.apiClient.update({
            where: { id },
            data: { status: "REVOKED", revokedAt: new Date(), previousSecretHash: null, previousSecretExpiresAt: null },
          });
    this.resolver.invalidate(client.publicKey, client.feedToken);
    return { client: clientView(client) };
  }

  async rotateFeedToken(tenant: TenantContext, id: string) {
    const current = await this.own(tenant, id);
    const client = await this.prisma.apiClient.update({ where: { id }, data: { feedToken: newFeedToken() } });
    this.resolver.invalidate(current.publicKey, current.feedToken);
    return { client: clientView(client) };
  }

  /** Pedidos por día (los días sin uso vienen en 0, para graficar sin huecos). */
  async usage(tenant: TenantContext, id: string, days = 30) {
    await this.own(tenant, id);
    const span = Math.min(Math.max(Math.floor(days) || 30, 1), USAGE_MAX_DAYS);
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const from = new Date(today.getTime() - (span - 1) * 86_400_000);
    const rows = await this.prisma.apiUsageDaily.findMany({ where: { apiClientId: id, day: { gte: from } } });
    const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
    return {
      days: Array.from({ length: span }, (_, i) => {
        const day = new Date(from.getTime() + i * 86_400_000).toISOString().slice(0, 10);
        const row = byDay.get(day);
        return { day, requests: row?.requests ?? 0, errors: row?.errors ?? 0 };
      }),
    };
  }

  // ---------- Webhooks ----------

  async listWebhooks(tenant: TenantContext, clientId: string) {
    await this.own(tenant, clientId);
    return { webhooks: await this.webhooks.list(clientId) };
  }

  async createWebhook(tenant: TenantContext, clientId: string, input: { url: string; events: unknown }) {
    const client = await this.own(tenant, clientId);
    if (client.status !== "ACTIVE") throw new BadRequestException("La key está revocada");
    return this.webhooks.create(clientId, input);
  }

  async updateWebhook(tenant: TenantContext, webhookId: string, input: { url?: string; events?: unknown; active?: boolean }) {
    await this.ownWebhook(tenant, webhookId);
    return this.webhooks.update(webhookId, input);
  }

  async deleteWebhook(tenant: TenantContext, webhookId: string) {
    await this.ownWebhook(tenant, webhookId);
    return this.webhooks.remove(webhookId);
  }

  async testWebhook(tenant: TenantContext, webhookId: string) {
    await this.ownWebhook(tenant, webhookId);
    return { delivery: await this.webhooks.test(webhookId) };
  }

  async rotateWebhookSecret(tenant: TenantContext, webhookId: string) {
    await this.ownWebhook(tenant, webhookId);
    return this.webhooks.rotateSecret(webhookId);
  }

  async deliveries(tenant: TenantContext, webhookId: string, limit?: number) {
    await this.ownWebhook(tenant, webhookId);
    return { deliveries: await this.webhooks.deliveries(webhookId, limit ?? 50) };
  }

  // ---------- internos ----------

  private async own(tenant: TenantContext, id: string): Promise<ApiClient> {
    this.assertManage(tenant);
    const client = await this.prisma.apiClient.findFirst({ where: { id, tenantId: tenant.tenantId } });
    if (!client) throw new NotFoundException("API key no encontrada");
    return client;
  }

  private async ownWebhook(tenant: TenantContext, webhookId: string) {
    this.assertManage(tenant);
    const webhook = await this.prisma.apiWebhookEndpoint.findFirst({
      where: { id: webhookId, apiClient: { tenantId: tenant.tenantId } },
      select: { id: true },
    });
    if (!webhook) throw new NotFoundException("Webhook no encontrado");
    return webhook;
  }

  /** Distribuidores que la API puede exponer (los mismos que entran en la foto del catálogo). */
  private async connectedProviders(tenant: TenantContext) {
    const visibles = await this.visibility.listFor(commercialId(tenant));
    return visibles.filter((v) => v.linked && !v.platformHidden).map((v) => ({ key: v.provider as string, label: v.name }));
  }

  private async parse(tenant: TenantContext, input: ClientInput, current: ApiClient | null) {
    try {
      const providers = (await this.connectedProviders(tenant)).map((p) => p.key);
      // Una key vieja puede tener un distribuidor que después se desconectó: se tolera lo que ya tenía.
      const known = [...new Set([...providers, ...resolveApiClientConfig(current?.config).providers.keys])];
      const name = input.name === undefined ? undefined : String(input.name).trim().slice(0, 80);
      if (name !== undefined && !name) throw new ConfigInputError(["Poné un nombre para la key."]);
      let expiresAt: Date | null | undefined;
      if (input.expiresAt !== undefined) {
        expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
        if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) {
          throw new ConfigInputError(["La fecha de vencimiento tiene que ser futura."]);
        }
      }
      return {
        name,
        config: parseConfigInput(input.config, current?.config ?? null, known),
        scopes: input.scopes === undefined && current ? (current.scopes as CatalogApiScope[]) : parseScopes(input.scopes),
        ipAllowlist: input.ipAllowlist === undefined && current ? current.ipAllowlist : parseIpAllowlist(input.ipAllowlist),
        expiresAt,
      };
    } catch (err) {
      if (err instanceof ConfigInputError) throw new BadRequestException({ message: err.message, details: { problems: err.problems } });
      throw err;
    }
  }

  /** Para tests y herramientas internas: vacía la foto en memoria del comercio. */
  refreshCatalog(tenantId: string) {
    this.snapshots.invalidate(tenantId);
  }
}
