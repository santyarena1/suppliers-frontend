import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { coerceStoredRetailPrice, isSaneRetailPrice } from "./retail-price.util";
import {
  extractSearchTokens,
  normalizeSearchText,
  passesRelevanceGate,
  scoreRetailMatch,
} from "./retail-search.util";

export interface RetailSearchHit {
  id: string;
  externalId: number;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  productUrl: string | null;
  imageUrl: string | null;
  categoryName: string | null;
  syncedAt: string;
  score: number;
  store: {
    id: string;
    externalId: number;
    name: string;
    logoUrl: string | null;
  };
}

export interface RetailProductDetail extends RetailSearchHit {
  priceHistory: {
    previousPrice: number | null;
    price: number;
    changedAt: string;
  }[];
}

@Injectable()
export class RetailSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: string,
    take = 60
  ): Promise<{ query: string; tokens: string[]; results: RetailSearchHit[]; totalMatched: number }> {
    const tokenObjs = extractSearchTokens(query, 10);
    const tokens = tokenObjs.map((t) => t.t);
    if (tokens.length === 0) {
      return { query, tokens: [], results: [], totalMatched: 0 };
    }

    const strong = tokenObjs.filter((t) => t.strong).map((t) => t.t);
    const queryTokens = [...new Set([...strong, ...tokens.slice(0, 4)])];

    const where: Prisma.RetailProductWhereInput = {
      active: true,
      OR: queryTokens.map((t) => ({
        searchText: { contains: t },
      })),
    };

    const poolSize = Math.min(Math.max(take * 12, 200), 800);
    const rows = await this.prisma.retailProduct.findMany({
      where,
      include: {
        store: {
          select: { id: true, externalId: true, name: true, logoUrl: true, priceDivisor: true },
        },
      },
      take: poolSize,
    });

    const scored = rows
      .map((row) => {
        const text = row.searchText || normalizeSearchText(row.name);
        const match = scoreRetailMatch(text, tokenObjs);
        const price = coerceStoredRetailPrice(Number(row.price), row.store.priceDivisor ?? 1);
        return { row, match, price, score: match.score };
      })
      .filter((x) => passesRelevanceGate(x.match, tokenObjs))
      .filter((x) => isSaneRetailPrice(x.price))
      .sort((a, b) => b.score - a.score || a.price - b.price);

    const topScore = scored[0]?.score ?? 0;
    const relevant =
      topScore > 0 && scored.length > take
        ? scored.filter((x) => x.score >= topScore * 0.35)
        : scored;

    const diversified = diversifyByStore(relevant, take, 4);

    return {
      query,
      tokens,
      totalMatched: scored.length,
      results: diversified.map(({ row, score, price }) => ({
        id: row.id,
        externalId: row.externalId,
        name: row.name,
        description: row.description,
        price,
        currency: row.currency,
        productUrl: row.productUrl,
        imageUrl: row.imageUrl,
        categoryName: row.categoryName,
        syncedAt: row.syncedAt.toISOString(),
        score,
        store: {
          id: row.store.id,
          externalId: row.store.externalId,
          name: row.store.name,
          logoUrl: row.store.logoUrl,
        },
      })),
    };
  }

  async getById(id: string): Promise<RetailProductDetail> {
    const row = await this.prisma.retailProduct.findUnique({
      where: { id },
      include: {
        store: {
          select: { id: true, externalId: true, name: true, logoUrl: true, priceDivisor: true },
        },
        priceHistory: {
          orderBy: { changedAt: "asc" },
          take: 60,
          select: { previousPrice: true, price: true, changedAt: true },
        },
      },
    });
    if (!row || !row.active) throw new NotFoundException("Producto no encontrado");

    const divisor = row.store.priceDivisor ?? 1;
    return {
      id: row.id,
      externalId: row.externalId,
      name: row.name,
      description: row.description,
      price: coerceStoredRetailPrice(Number(row.price), divisor),
      currency: row.currency,
      productUrl: row.productUrl,
      imageUrl: row.imageUrl,
      categoryName: row.categoryName,
      syncedAt: row.syncedAt.toISOString(),
      score: 0,
      store: {
        id: row.store.id,
        externalId: row.store.externalId,
        name: row.store.name,
        logoUrl: row.store.logoUrl,
      },
      priceHistory: row.priceHistory.map((h) => ({
        previousPrice:
          h.previousPrice != null
            ? coerceStoredRetailPrice(Number(h.previousPrice), divisor)
            : null,
        price: coerceStoredRetailPrice(Number(h.price), divisor),
        changedAt: h.changedAt.toISOString(),
      })),
    };
  }
}

function diversifyByStore<
  T extends { row: { id: string; store: { id: string } }; score: number }
>(scored: T[], take: number, maxPerStoreFirstPass: number): T[] {
  const out: T[] = [];
  const used = new Set<string>();
  const perStoreCount = new Map<string, number>();

  for (const item of scored) {
    if (out.length >= take) break;
    const sid = item.row.store.id;
    const n = perStoreCount.get(sid) ?? 0;
    if (n >= maxPerStoreFirstPass) continue;
    if (used.has(item.row.id)) continue;
    used.add(item.row.id);
    perStoreCount.set(sid, n + 1);
    out.push(item);
  }

  if (out.length < take) {
    for (const item of scored) {
      if (out.length >= take) break;
      if (used.has(item.row.id)) continue;
      used.add(item.row.id);
      out.push(item);
    }
  }

  return out;
}
