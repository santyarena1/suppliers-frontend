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
    const unique = [...new Set(categories.filter(Boolean))].slice(0, 200);
    if (unique.length === 0) return { clusters: [], usedAi: false };

    if (!(await this.isConfigured())) {
      return { clusters: heuristicCategoryClusters(unique), usedAi: false };
    }

    try {
      const clusters = await this.chatJson<AiCategoryCluster[]>(
        `Agrupá nombres de catálogo IT (categorías o marcas) que significan lo mismo aunque estén escritos distinto o en distintos distribuidores.
Devolvé JSON array de objetos { "label": string, "members": string[], "confidence": "alta"|"media"|"baja" }.
Reglas:
- Cada member debe aparecer EXACTO como en la lista de entrada.
- Preferí labels canónicos de esta lista si aplica: ${knownLabels.slice(0, 50).join(", ") || "(ninguno aún)"}
- Devolvé TODOS los grupos razonables (hasta 40), no solo 2 o 3.
- Incluí variantes ortográficas, plural/singular y abreviaturas.
Entrada: ${JSON.stringify(unique)}`
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

  /**
   * Igual que suggestProductMetadata pero para una página entera de productos en
   * una sola llamada: mucho más barato y rápido que uno por uno. Sin clave o si
   * el modelo falla, cae a la heurística por producto.
   */
  async suggestProductMetadataBatch(input: {
    products: {
      externalId: string;
      name: string;
      provider: string;
      brand?: string | null;
      category?: string | null;
      subcategory?: string | null;
      sku?: string | null;
      partNumber?: string | null;
    }[];
    knownBrands: string[];
    knownCategories: string[];
  }): Promise<Map<string, AiProductHint>> {
    const out = new Map<string, AiProductHint>();
    const fallback = () => {
      for (const p of input.products) {
        out.set(p.externalId, this.heuristicProductHint({ ...p, knownBrands: input.knownBrands, knownCategories: input.knownCategories }));
      }
      return out;
    };
    if (input.products.length === 0) return out;
    if (!(await this.isConfigured())) return fallback();

    try {
      const result = await this.chatJson<{ items?: unknown }>(
        `Sugerí marca, categoría y subcategoría para cada producto de un catálogo IT en Argentina.
Respondé JSON { "items": [ { "externalId": string, "displayBrand": string|null, "displayCategory": string|null, "displaySubcategory": string|null } ] } con un ítem por producto, mismo externalId.
Elegí marca y categoría SOLO de las listas conocidas cuando haya match razonable (la marca suele estar en el nombre); si no hay match claro, null en ese campo.
Marcas conocidas: ${input.knownBrands.slice(0, 80).join(", ")}
Categorías conocidas: ${input.knownCategories.slice(0, 80).join(", ")}
Productos: ${JSON.stringify(
          input.products.map((p) => ({
            externalId: p.externalId,
            name: p.name,
            provider: p.provider,
            brand: p.brand ?? undefined,
            category: p.category ?? undefined,
            subcategory: p.subcategory ?? undefined,
            sku: p.sku ?? undefined,
            partNumber: p.partNumber ?? undefined,
          }))
        )}`
      );
      const items = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
      const byId = new Map<string, Record<string, unknown>>();
      for (const it of items) {
        if (it && typeof it === "object" && typeof (it as { externalId?: unknown }).externalId === "string") {
          byId.set((it as { externalId: string }).externalId, it as Record<string, unknown>);
        }
      }
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      for (const p of input.products) {
        const hit = byId.get(p.externalId);
        if (!hit) {
          out.set(p.externalId, this.heuristicProductHint({ ...p, knownBrands: input.knownBrands, knownCategories: input.knownCategories }));
          continue;
        }
        out.set(p.externalId, {
          displayBrand: str(hit.displayBrand),
          displayCategory: str(hit.displayCategory),
          displaySubcategory: str(hit.displaySubcategory),
          reasoning: "Sugerencia IA",
          source: "ai",
        });
      }
      return out;
    } catch (err) {
      this.logger.warn(`AI batch product hints failed: ${err instanceof Error ? err.message : err}`);
      return fallback();
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

  /**
   * Una llamada en modo JSON al modelo configurado. `systemPrompt` permite que
   * otros módulos (ej. el aprendiz de perfiles de importación) fijen su propio rol.
   */
  async chatJson<T>(userPrompt: string, systemPrompt?: string): Promise<T> {
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
              systemPrompt ??
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
