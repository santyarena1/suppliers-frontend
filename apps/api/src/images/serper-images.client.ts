import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";
import axios from "axios";
import { pickFirstImageUrl, pickSerperImages, type SerperImageHit } from "./product-image";

const SERPER_IMAGES = "https://google.serper.dev/images";

/** Errores que deben abortar la corrida y dejar el producto pendiente (no “consumido”). */
export function isSerperBlockingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("api key de serper no es válida") ||
    m.includes("limitando (429)") ||
    m.includes("sin créditos") ||
    m.includes("sin credito") ||
    /\b(credit|credits|quota|insufficient|balance|billing|payment)\b/.test(m)
  );
}

function serperErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const key of ["message", "error", "msg"]) {
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return fallback;
}

@Injectable()
export class SerperImagesClient {
  async searchImages(apiKey: string, query: string, num = 10): Promise<SerperImageHit[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const res = await axios.post(
        SERPER_IMAGES,
        { q, gl: "ar", hl: "es", num },
        {
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          timeout: 20_000,
        }
      );
      return pickSerperImages(res.data, num);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const bodyMsg = serperErrorMessage(err.response?.data, err.message);
        if (status === 401 || status === 403) {
          throw new BadRequestException("La API key de Serper no es válida");
        }
        if (status === 402 || /credit|crédito|quota|insufficient|balance|billing/i.test(bodyMsg)) {
          throw new BadGatewayException(
            "Serper sin créditos o cuota agotada. Recargá la cuenta y reintentá; los productos quedan pendientes."
          );
        }
        if (status === 429) {
          throw new BadGatewayException("Serper está limitando (429). Esperá un momento y reintentá.");
        }
        throw new BadGatewayException(`Serper falló: ${bodyMsg}`);
      }
      throw err;
    }
  }

  async firstPhoto(apiKey: string, query: string): Promise<string | null> {
    const hits = await this.searchImages(apiKey, query, 10);
    return hits[0]?.imageUrl ?? pickFirstImageUrl({ images: hits });
  }
}
