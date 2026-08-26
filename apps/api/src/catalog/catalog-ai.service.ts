import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { heuristicCategoryClusters } from "./catalog-enrichment";
import { CatalogSettingsService } from "./catalog-settings.service";

export type AiCategoryCluster = { label: string; members: string[]; confidence?: string };
export type AiProductHint = {
  displayBrand: string | null;
  displayCategory: string | null;
  displaySubcategory: string | null;
  reasoning: string;
  source: "ai" | "heuristic";
};

@Injectable()
export class CatalogAiService {
  private readonly logger = new Logger(CatalogAiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly settings: CatalogSettingsService
  ) {}

  async isConfigured() {
    return this.settings.hasOpenAiKey();
  }

  async suggestCategoryClusters(
    categories: string[],
    knownLabels: string[]
  ): Promise<{ clusters: AiCategoryCluster[]; usedAi: boolean }> {
    const unique = [...new Set(categories.filter(Boolean))].slice(0, 120);
    if (unique.length === 0) return { clusters: [], usedAi: false };

    if (!(await this.isConfigured())) {
      return { clusters: heuristicCategoryClusters(unique), usedAi: false };
    }

    try {
      const clusters = await this.chatJson<AiCategoryCluster[]>(
        `Agrupá categorías de catálogo IT que significan lo mismo. Devolvé JSON array de objetos { "label": string, "members": string[], "confidence": "alta"|"media"|"baja" }.
El label debe ser uno de los members o una variante clara. Solo agrupá si hay alta confianza semántica.
Categorías existentes en plataforma (preferí estos labels cuando aplique): ${knownLabels.slice(0, 40).join(", ")}
Categorías a analizar: ${JSON.stringify(unique)}`
      );
      if (Array.isArray(clusters) && clusters.length > 0) {
        return { clusters: clusters.slice(0, 30), usedAi: true };
      }
    } catch (err) {
      this.logger.warn(`AI category clusters failed: ${err instanceof Error ? err.message : err}`);
    }

    return { clusters: heuristicCategoryClusters(unique), usedAi: false };
  }

  async suggestProductMetadata(input: {
    name: string;
    provider: string;
    brand?: string | null;
    category?: string | null;
    subcategory?: string | null;
    ean?: string | null;
    partNumber?: string | null;
    knownBrands: string[];
    knownCategories: string[];
  }): Promise<AiProductHint> {
    const fallback = this.heuristicProductHint(input);

    if (!(await this.isConfigured())) return fallback;

    try {
      const result = await this.chatJson<{
        displayBrand?: string | null;
        displayCategory?: string | null;
        displaySubcategory?: string | null;
        reasoning?: string;
      }>(
        `Sugerí marca y categoría para un producto de catálogo IT en Argentina.
Respondé JSON { "displayBrand": string|null, "displayCategory": string|null, "displaySubcategory": string|null, "reasoning": string }.
Elegí marca y categoría SOLO de las listas conocidas cuando haya match razonable; si no hay match claro, devolvé null en ese campo.
Marcas conocidas: ${input.knownBrands.slice(0, 60).join(", ")}
Categorías conocidas: ${input.knownCategories.slice(0, 60).join(", ")}
Producto: ${JSON.stringify({
          name: input.name,
          provider: input.provider,
          brand: input.brand,
          category: input.category,
          subcategory: input.subcategory,
          ean: input.ean,
          partNumber: input.partNumber,
        })}`
      );

      return {
        displayBrand: result.displayBrand ?? null,
        displayCategory: result.displayCategory ?? null,
        displaySubcategory: result.displaySubcategory ?? null,
        reasoning: result.reasoning ?? "Sugerencia IA",
        source: "ai",
      };
    } catch (err) {
      this.logger.warn(`AI product hint failed: ${err instanceof Error ? err.message : err}`);
      return fallback;
    }
  }

  private heuristicProductHint(input: {
    name: string;
    brand?: string | null;
    category?: string | null;
    knownBrands: string[];
    knownCategories: string[];
  }): AiProductHint {
    const nameLower = input.name.toLowerCase();
    const brand =
      input.knownBrands.find((b) => nameLower.includes(b.toLowerCase())) ??
      (input.brand?.trim() || null);
    const category =
      input.knownCategories.find((c) => nameLower.includes(c.toLowerCase())) ??
      (input.category?.trim() || null);

    return {
      displayBrand: brand,
      displayCategory: category,
      displaySubcategory: null,
      reasoning: "Heurística por nombre (sin API key de OpenAI)",
      source: "heuristic",
    };
  }

  private async chatJson<T>(userPrompt: string): Promise<T> {
    const apiKey = await this.settings.readOpenAiKey();
    if (!apiKey) throw new Error("OpenAI API key not configured");
    const model = this.config.get<string>("OPENAI_MODEL") ?? "gpt-4o-mini";
    const baseUrl = (this.config.get<string>("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");

    const { data } = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Sos un asistente de taxonomía de catálogo IT. Respondé solo JSON válido. Para arrays envolvé en { "items": [...] } si hace falta.',
          },
          { role: "user", content: userPrompt },
        ],
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        timeout: 45_000,
      }
    );

    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string") throw new Error("Empty AI response");

    const parsed = JSON.parse(text) as T | { items: T };
    if (parsed && typeof parsed === "object" && "items" in parsed && Array.isArray((parsed as { items: unknown }).items)) {
      return (parsed as { items: T }).items;
    }
    return parsed as T;
  }
}
