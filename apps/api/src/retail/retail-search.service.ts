import { Injectable } from "@nestjs/common";
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
  priceHistory: {
    previousPrice: number | null;
    price: number;
    changedAt: string;
  }[];
}

@Injectable()
export class RetailSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string, take = 30): Promise<{ query: string; tokens: string[]; results: RetailSearchHit[] }> {
    const tokens = extractSearchTokens(query, 6);
    if (tokens.length === 0) {
      return { query, tokens: [], results: [] };
    }

    // Búsqueda amplia: alcanza con que aparezca CUALQUIERA de los tokens
    // fuertes; después rankeamos por cuántos matchean.
    const where: Prisma.RetailProductWhereInput = {
      active: true,
      OR: tokens.map((t) => ({
        searchText: { contains: t },
      })),
    };

    const rows = await this.prisma.retailProduct.findMany({
      where,
      include: {
        store: { select: { id: true, externalId: true, name: true, logoUrl: true } },
        priceHistory: {
          orderBy: { changedAt: "desc" },
          take: 8,
          select: { previousPrice: true, price: true, changedAt: true },
        },
      },
      take: Math.min(Math.max(take * 4, 40), 200),
    });

    const scored = rows
      .map((row) => {
        const text = row.searchText || normalizeSearchText(row.name);
        let score = 0;
        for (const t of tokens) {
          if (text.includes(t)) score += t.length >= 4 || /^\d/.test(t) ? 3 : 1;
        }
        // Bonus si el nombre empieza parecido al primer token
        if (tokens[0] && text.startsWith(tokens[0])) score += 2;
        return { row, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || Number(a.row.price) - Number(b.row.price))
      .slice(0, take);

    return {
      query,
      tokens,
      results: scored.map(({ row, score }) => ({
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
        priceHistory: row.priceHistory.map((h) => ({
          previousPrice: h.previousPrice != null ? Number(h.previousPrice) : null,
          price: Number(h.price),
          changedAt: h.changedAt.toISOString(),
        })),
      })),
    };
  }
}
