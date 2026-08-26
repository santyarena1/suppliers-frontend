import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";
import axios from "axios";
import { pickFirstImageUrl } from "./product-image";

const SERPER_IMAGES = "https://google.serper.dev/images";

@Injectable()
export class SerperImagesClient {
  async firstPhoto(apiKey: string, query: string): Promise<string | null> {
    const q = query.trim();
    if (!q) return null;
    try {
      const res = await axios.post(
        SERPER_IMAGES,
        { q, gl: "ar", hl: "es", num: 10 },
        {
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          timeout: 20_000,
        }
      );
      return pickFirstImageUrl(res.data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          throw new BadRequestException("La API key de Serper no es válida");
        }
        if (status === 429) {
          throw new BadGatewayException("Serper está limitando (429). Esperá un momento y reintentá.");
        }
        const body = err.response?.data;
        const msg =
          (body && typeof body === "object" && "message" in body && typeof body.message === "string"
            ? body.message
            : null) || err.message;
        throw new BadGatewayException(`Serper falló: ${msg}`);
      }
      throw err;
    }
  }
}
