import { Injectable } from "@nestjs/common";
import {
  isTenantPlan,
  resolveApiClientConfig,
  resolveEntitlements,
  type CatalogApiScope,
  type TenantPlan,
  type TenantType,
} from "@nodo/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { SUBSCRIPTION_DATES_SELECT, toSubscriptionDates } from "../../tenants/tenant-context.service";
import { Errors } from "../core/api-error";
import { secretMatches } from "./api-key-crypto";
import type { ApiPrincipal } from "./api-principal";
import { ipAllowed } from "./ip-allowlist";

const CACHE_MS = 10_000;

const CLIENT_SELECT = {
  id: true,
  name: true,
  publicKey: true,
  secretHash: true,
  previousSecretHash: true,
  previousSecretExpiresAt: true,
  feedToken: true,
  status: true,
  config: true,
  scopes: true,
  ipAllowlist: true,
  rateLimitPerMinute: true,
  expiresAt: true,
  createdAt: true,
  tenant: {
    select: {
      id: true,
      name: true,
      type: true,
      plan: true,
      active: true,
      mirrorsCommercialFromId: true,
      subscription: { select: SUBSCRIPTION_DATES_SELECT },
    },
  },
} as const;

type ClientRow = NonNullable<Awaited<ReturnType<PrismaService["apiClient"]["findUnique"]>>> & {
  tenant: {
    id: string;
    name: string;
    type: string;
    plan: string;
    active: boolean;
    mirrorsCommercialFromId: string | null;
    subscription: Parameters<typeof toSubscriptionDates>[0];
  };
};

/**
 * Valida una key (o un token de feed) y arma el `ApiPrincipal`. El resultado de
 * la base se guarda 10 s por key: un integrador que pide seguido no le pega a la
 * base en cada pedido. Gestionar la key (rotar, revocar, configurar) lo limpia.
 */
@Injectable()
export class ApiClientResolver {
  private readonly cache = new Map<string, { at: number; row: ClientRow | null }>();

  constructor(private readonly prisma: PrismaService) {}

  invalidate(publicKey?: string, feedToken?: string) {
    if (publicKey) this.cache.delete(`pk:${publicKey}`);
    if (feedToken) this.cache.delete(`ft:${feedToken}`);
    if (!publicKey && !feedToken) this.cache.clear();
  }

  async byCredentials(key: string, secret: string, ip: string, scope: CatalogApiScope | null, now = new Date()): Promise<ApiPrincipal> {
    if (!/^nodo_pk_[0-9A-Za-z]{10,40}$/.test(key)) throw Errors.invalidCredentials();
    const row = await this.load("pk", key, { publicKey: key });
    if (!row) throw Errors.invalidCredentials();
    const current = secretMatches(secret, row.secretHash);
    const previous =
      !current &&
      row.previousSecretExpiresAt != null &&
      row.previousSecretExpiresAt > now &&
      secretMatches(secret, row.previousSecretHash);
    if (!current && !previous) throw Errors.invalidCredentials();
    return this.authorize(row, ip, scope, now);
  }

  async byFeedToken(token: string, ip: string, now = new Date()): Promise<ApiPrincipal> {
    if (!/^nodo_ft_[0-9A-Za-z]{10,48}$/.test(token)) throw Errors.notFound("El feed");
    const row = await this.load("ft", token, { feedToken: token });
    if (!row) throw Errors.notFound("El feed");
    return this.authorize(row, ip, "feeds:read", now);
  }

  /** Para trabajos internos (webhooks): la key sin credencial ni IP, con todo lo demás. */
  async byClientId(clientId: string, now = new Date()): Promise<ApiPrincipal> {
    const row = (await this.prisma.apiClient.findUnique({ where: { id: clientId }, select: CLIENT_SELECT })) as ClientRow | null;
    if (!row) throw Errors.notFound("La API key");
    return this.authorize(row, null, null, now);
  }

  private async load(kind: "pk" | "ft", value: string, where: { publicKey: string } | { feedToken: string }) {
    const cacheKey = `${kind}:${value}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.row;
    const row = (await this.prisma.apiClient.findUnique({ where, select: CLIENT_SELECT })) as ClientRow | null;
    if (this.cache.size > 5_000) this.cache.clear();
    this.cache.set(cacheKey, { at: Date.now(), row });
    return row;
  }

  /** Lo que tiene que cumplirse además de la credencial. El orden importa: primero lo de la key. */
  private authorize(row: ClientRow, ip: string | null, scope: CatalogApiScope | null, now: Date): ApiPrincipal {
    if (row.status !== "ACTIVE") throw Errors.keyRevoked();
    if (row.expiresAt && row.expiresAt <= now) throw Errors.keyExpired();
    if (ip != null && !ipAllowed(ip, row.ipAllowlist)) throw Errors.ipNotAllowed(ip);
    const scopes = row.scopes as CatalogApiScope[];
    if (scope && !scopes.includes(scope)) throw Errors.scopeRequired(scope);

    const tenant = row.tenant;
    if (!tenant.active) throw Errors.tenantInactive();
    const plan = (isTenantPlan(tenant.plan) ? tenant.plan : "PRO") as TenantPlan;
    const entitlements = resolveEntitlements({
      tenantType: tenant.type as TenantType,
      plan,
      subscription: toSubscriptionDates(tenant.subscription),
      now,
    });
    if (entitlements.enforced && entitlements.access !== "FULL") throw Errors.subscriptionSuspended();
    if (tenant.type !== "RETAILER" || !entitlements.capabilities.catalogApi) throw Errors.addonRequired();

    return {
      clientId: row.id,
      clientName: row.name,
      publicKey: row.publicKey,
      scopes,
      rateLimitPerMinute: row.rateLimitPerMinute,
      tenantId: tenant.id,
      tenantName: tenant.name,
      plan,
      catalogTenantId: tenant.mirrorsCommercialFromId ?? tenant.id,
      config: resolveApiClientConfig(row.config),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }
}
