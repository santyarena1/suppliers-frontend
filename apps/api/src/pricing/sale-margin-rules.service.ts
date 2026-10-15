import { Injectable } from "@nestjs/common";
import type { SaleMarginBase } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { NO_PERCEPTIONS, type PerceptionPolicy } from "../catalog-api/core/pricing";

/** Todo lo que hace falta para calcular el precio de venta de un comercio. */
export interface TenantSaleRules {
  /** Margen por clave de regla (`saleRuleKey`). */
  rules: Map<string, number>;
  /** Base del margen por distribuidor; sin configuración = FINAL. */
  bases: Map<string, SaleMarginBase>;
  /** Percepciones del comercio por distribuidor (entran en el costo final). */
  policies: Map<string, PerceptionPolicy>;
  /**
   * Estado de cada producto de las tiendas de comercios ("prov:externalId" →
   * NEW, USED…). Solo se carga si el comercio tiene márgenes por estado.
   */
  conditions?: Map<string, string>;
}

/** Clave del mapa de estados. */
export const conditionKey = (provider: string, externalId: string) => `${provider}:${externalId}`;

const TTL_MS = 60_000;
const MAX_TENANTS = 500;

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Reglas de margen de cada comercio, cacheadas un minuto. Se leen en cada
 * búsqueda; quien las escribe invalida el caché de ese comercio.
 */
@Injectable()
export class SaleMarginRulesService {
  private readonly cache = new Map<string, { at: number; value: Promise<TenantSaleRules> }>();

  constructor(private readonly prisma: PrismaService) {}

  get(tenantId: string): Promise<TenantSaleRules> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const value = this.load(tenantId).catch((err) => {
      this.cache.delete(tenantId);
      throw err;
    });
    if (this.cache.size >= MAX_TENANTS) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(tenantId, { at: Date.now(), value });
    return value;
  }

  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }

  private async load(tenantId: string): Promise<TenantSaleRules> {
    const [rows, configs] = await Promise.all([
      this.prisma.saleMarginRule.findMany({ where: { tenantId }, select: { ruleKey: true, percent: true } }),
      this.prisma.providerSyncConfig.findMany({
        where: { tenantId },
        select: {
          provider: true,
          saleMarginBase: true,
          manualIibbPercent: true,
          manualPerceptionsPercent: true,
          learnedIibbPercent: true,
        },
      }),
    ]);
    const rules = new Map<string, number>();
    for (const row of rows) {
      const percent = num(row.percent);
      if (percent != null) rules.set(row.ruleKey, percent);
    }
    const bases = new Map<string, SaleMarginBase>();
    const policies = new Map<string, PerceptionPolicy>();
    for (const c of configs) {
      bases.set(c.provider, c.saleMarginBase === "NET" ? "NET" : "FINAL");
      policies.set(c.provider, {
        manualIibbPercent: num(c.manualIibbPercent),
        manualPerceptionsPercent: num(c.manualPerceptionsPercent),
        learnedIibbPercent: num(c.learnedIibbPercent),
      });
    }
    return { rules, bases, policies, conditions: await this.conditions(rows.map((r) => r.ruleKey)) };
  }

  /** Estados de los productos de las tiendas a las que el comercio les puso margen por estado. */
  private async conditions(ruleKeys: string[]): Promise<Map<string, string>> {
    const providers = [...new Set(ruleKeys.filter((k) => k.startsWith("E:")).map((k) => k.split(":")[1]).filter(Boolean))];
    const out = new Map<string, string>();
    if (providers.length === 0) return out;
    const items = await this.prisma.storefrontItem.findMany({
      where: { condition: { not: null }, storefront: { supplierTenant: { providerKey: { in: providers } } } },
      select: { externalId: true, condition: true, storefront: { select: { supplierTenant: { select: { providerKey: true } } } } },
    });
    for (const it of items) {
      const provider = it.storefront.supplierTenant.providerKey;
      if (provider && it.condition) out.set(conditionKey(provider, it.externalId), it.condition);
    }
    return out;
  }
}

export function baseFor(rules: TenantSaleRules, provider: string): SaleMarginBase {
  return rules.bases.get(provider) ?? "FINAL";
}

export function policyFor(rules: TenantSaleRules, provider: string): PerceptionPolicy {
  return rules.policies.get(provider) ?? NO_PERCEPTIONS;
}
