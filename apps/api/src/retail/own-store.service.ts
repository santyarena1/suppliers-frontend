import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { assertPermission, assertTenantType, hasPermission } from "../tenants/tenant-roles";
import type { TenantContext } from "../tenants/tenant-context.service";
import { PrismaService } from "../prisma/prisma.service";
import { ownStoreSearchPlan, pickOwnStoreMatch, type OwnStoreMatchRow } from "./own-store.match";

const OPTION_SELECT = {
  id: true,
  name: true,
  logoUrl: true,
  syncedAt: true,
  _count: { select: { products: { where: { active: true } } } },
} satisfies Prisma.RetailStoreSelect;

type StoreOptionRow = Prisma.RetailStoreGetPayload<{ select: typeof OPTION_SELECT }>;

export interface OwnStoreOption {
  id: string;
  name: string;
  logoUrl: string | null;
  syncedAt: string;
  productCount: number;
}

function toOption(row: StoreOptionRow): OwnStoreOption {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logoUrl,
    syncedAt: row.syncedAt.toISOString(),
    productCount: row._count.products,
  };
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  if (workers > 0) await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

/**
 * La tienda web del comercio, elegida entre los locales que ya sincronizamos.
 * El precio de venta de esa tienda se compara con el costo final del distribuidor.
 */
@Injectable()
export class OwnStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenant: TenantContext) {
    assertTenantType(tenant, ["RETAILER"]);
    const row = await this.prisma.tenant.findUnique({
      where: { id: tenant.tenantId },
      select: { ownRetailStore: { select: { ...OPTION_SELECT, active: true } } },
    });
    const store = row?.ownRetailStore?.active ? toOption(row.ownRetailStore) : null;
    return { canEdit: hasPermission(tenant, "providers.manage"), store };
  }

  async listOptions(tenant: TenantContext): Promise<OwnStoreOption[]> {
    assertTenantType(tenant, ["RETAILER"]);
    const stores = await this.prisma.retailStore.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: OPTION_SELECT,
    });
    return stores.map(toOption);
  }

  async set(tenant: TenantContext, retailStoreId: string | null) {
    assertTenantType(tenant, ["RETAILER"]);
    assertPermission(tenant, "providers.manage");
    if (retailStoreId) {
      const store = await this.prisma.retailStore.findFirst({
        where: { id: retailStoreId, active: true },
        select: { id: true },
      });
      if (!store) throw new BadRequestException("Ese local no está entre los que ya sincronizamos");
    }
    await this.prisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { ownRetailStoreId: retailStoreId },
    });
    return this.get(tenant);
  }

  async quotes(tenant: TenantContext, items: { key: string; name: string }[]) {
    assertTenantType(tenant, ["RETAILER"]);
    const row = await this.prisma.tenant.findUnique({
      where: { id: tenant.tenantId },
      select: {
        ownRetailStore: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            externalId: true,
            priceDivisor: true,
            active: true,
          },
        },
      },
    });
    const store = row?.ownRetailStore;
    if (!store?.active) return { store: null, quotes: [] };

    const matched = await mapPool(items, 5, (item) => this.matchOne(store, item));
    return {
      store: { id: store.id, name: store.name, logoUrl: store.logoUrl },
      quotes: matched.filter((quote): quote is NonNullable<typeof quote> => quote != null),
    };
  }

  private async matchOne(
    store: {
      id: string;
      name: string;
      externalId: number;
      priceDivisor: number;
    },
    item: { key: string; name: string }
  ) {
    const plan = ownStoreSearchPlan(item.name);
    if (!plan) return null;
    const tokenFilters: Prisma.RetailProductWhereInput[] =
      plan.skuTokens.length > 0
        ? plan.skuTokens.map((token) => ({ searchText: { contains: token } }))
        : [{ OR: plan.orTokens.map((token) => ({ searchText: { contains: token } })) }];

    const rows = await this.prisma.retailProduct.findMany({
      where: { storeId: store.id, active: true, AND: tokenFilters },
      take: 40,
      select: {
        id: true,
        name: true,
        searchText: true,
        price: true,
        productUrl: true,
        imageUrl: true,
        syncedAt: true,
        currency: true,
      },
    });

    const input: OwnStoreMatchRow[] = rows.map((product) => ({
      id: product.id,
      name: product.name,
      searchText: product.searchText,
      price: Number(product.price),
      productUrl: product.productUrl,
      imageUrl: product.imageUrl,
      syncedAt: product.syncedAt,
      currency: product.currency,
    }));
    const match = pickOwnStoreMatch(input, item.name, store);
    if (!match) return null;
    return { key: item.key, ...match };
  }
}
