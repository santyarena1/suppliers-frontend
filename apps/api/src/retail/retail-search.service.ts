import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isSaneRetailPrice, normalizeExternalPrice } from "./retail-price.util";
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

    // Preferí tokens fuertes en el OR para no traer todo el catálogo de "cooler"/"rgb".
    const strong = tokenObjs.filter((t) => t.strong).map((t) => t.t);
    const queryTokens = strong.length > 0 ? strong : tokens;

    const where: Prisma.RetailProductWhereInput = {
      active: true,
      OR: queryTokens.map((t) => ({
        searchText: { contains: t },
      })),
    };

    const poolSize = Math.min(Math.max(take * 10, 150), 600);
    const rows = await this.prisma.retailProduct.findMany({
      where,
      include: {
        store: { select: { id: true, externalId: true, name: true, logoUrl: true } },
      },
      take: poolSize,
    });

    const scored = rows
      .map((row) => {
        const text = row.searchText || normalizeSearchText(row.name);
        const match = scoreRetailMatch(text, tokenObjs);
        const price = normalizeExternalPrice(Number(row.price));
        return { row, match, price, score: match.score };
      })
      .filter((x) => passesRelevanceGate(x.match, tokenObjs))
      .filter((x) => isSaneRetailPrice(x.price))
      .sort((a, b) => b.score - a.score || a.price - b.price);

    // Si hay matches fuertes, no rellenar con score bajo
    const topScore = scored[0]?.score ?? 0;
    const relevant =
      topScore > 0
        ? scored.filter((x) => x.score >= Math.max(topScore * 0.45, topScore - 20))
        : scored;

    const diversified = diversifyByStore(relevant, take, 3);

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
        store: row.store,
      })),
    };
  }

  async getById(id: string): Promise<RetailProductDetail> {
    const row = await this.prisma.retailProduct.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, externalId: true, name: true, logoUrl: true } },
        priceHistory: {
          orderBy: { changedAt: "asc" },
          take: 60,
          select: { previousPrice: true, price: true, changedAt: true },
        },
      },
    });
    if (!row || !row.active) throw new NotFoundException("Producto no encontrado");

    return {
      id: row.id,
      externalId: row.externalId,
      name: row.name,
      description: row.description,
      price: normalizeExternalPrice(Number(row.price)),
      currency: row.currency,
      productUrl: row.productUrl,
      imageUrl: row.imageUrl,
      categoryName: row.categoryName,
      syncedAt: row.syncedAt.toISOString(),
      score: 0,
      store: row.store,
      priceHistory: row.priceHistory.map((h) => ({
        previousPrice:
          h.previousPrice != null ? normalizeExternalPrice(Number(h.previousPrice)) : null,
        price: normalizeExternalPrice(Number(h.price)),
        changedAt: h.changedAt.toISOString(),
      })),
    };
  }
}

/** Mezcla resultados para no saturar con un solo local. */
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
