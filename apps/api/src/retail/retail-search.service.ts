import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { extractSearchTokens, normalizeSearchText } from "./retail-search.util";

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
    const tokens = extractSearchTokens(query, 8);
    if (tokens.length === 0) {
      return { query, tokens: [], results: [], totalMatched: 0 };
    }

    // Amplia: cualquier token fuerte. Después exigimos un score mínimo y
    // diversificamos por local para no llenar con 3 del mismo.
    const where: Prisma.RetailProductWhereInput = {
      active: true,
      OR: tokens.map((t) => ({
        searchText: { contains: t },
      })),
    };

    const poolSize = Math.min(Math.max(take * 8, 120), 500);
    const rows = await this.prisma.retailProduct.findMany({
      where,
      include: {
        store: { select: { id: true, externalId: true, name: true, logoUrl: true } },
      },
      take: poolSize,
    });

    const minScore = tokens.length >= 3 ? 4 : tokens.length >= 2 ? 2 : 1;

    const scored = rows
      .map((row) => {
        const text = row.searchText || normalizeSearchText(row.name);
        let score = 0;
        let hits = 0;
        for (const t of tokens) {
          if (text.includes(t)) {
            hits += 1;
            score += t.length >= 4 || /^\d/.test(t) ? 3 : 1;
          }
        }
        // Bonus por coincidencia de varios tokens (producto más parecido)
        if (hits >= 2) score += hits * 2;
        if (hits >= 3) score += 3;
        if (tokens[0] && text.includes(tokens[0])) score += 1;
        return { row, score, hits };
      })
      .filter((x) => x.score >= minScore)
      .sort((a, b) => b.score - a.score || Number(a.row.price) - Number(b.row.price));

    const diversified = diversifyByStore(
      scored.map((x) => x),
      take,
      4 // máx. por local en la primera pasada
    );

    return {
      query,
      tokens,
      totalMatched: scored.length,
      results: diversified.map(({ row, score }) => ({
        id: row.id,
        externalId: row.externalId,
        name: row.name,
        description: row.description,
        price: Number(row.price),
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
      price: Number(row.price),
      currency: row.currency,
      productUrl: row.productUrl,
      imageUrl: row.imageUrl,
      categoryName: row.categoryName,
      syncedAt: row.syncedAt.toISOString(),
      score: 0,
      store: row.store,
      priceHistory: row.priceHistory.map((h) => ({
        previousPrice: h.previousPrice != null ? Number(h.previousPrice) : null,
        price: Number(h.price),
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
