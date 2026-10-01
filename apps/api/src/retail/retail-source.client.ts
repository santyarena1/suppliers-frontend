import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosInstance } from "axios";
import {
  RetailSourceUnavailableError,
  describeRetailSourceError,
} from "./retail-source.error";

const DEFAULT_BASE = "https://api.preciolider.com.ar";
const CIRCUIT_MS = 10 * 60_000;

export interface ExternalStore {
  id: number;
  nombre: string;
  imagenes?: { url?: string }[];
  estado?: { nombre?: string } | null;
  [key: string]: unknown;
}

export interface ExternalPriceHistory {
  id: number;
  productId: number;
  precioAnterior: number | null;
  precioActual: number;
  fechaDeCambio: string;
}

export interface ExternalProduct {
  id: number;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  url?: string | null;
  imagenes?: { url?: string }[];
  tienda?: { id: number; nombre: string; imagenes?: { url?: string }[] } | null;
  categorias?: { categoria?: { id: number; nombre: string } | null }[];
  historialPrecios?: ExternalPriceHistory[];
  [key: string]: unknown;
}

interface ProductsPage {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  products: ExternalProduct[];
}

@Injectable()
export class RetailSourceClient {
  private readonly logger = new Logger(RetailSourceClient.name);
  private readonly http: AxiosInstance;
  private downUntil = 0;
  private downReason = "";

  constructor(config: ConfigService) {
    const baseURL = (config.get<string>("RETAIL_SOURCE_BASE_URL") || DEFAULT_BASE).replace(/\/$/, "");
    this.http = axios.create({
      baseURL,
      timeout: 20_000,
      // Axios toma HTTP_PROXY del entorno. Esta fuente no necesita proxy y un
      // intermediario mal configurado termina hablando con otro certificado.
      proxy: false,
      headers: {
        Accept: "application/json",
        "User-Agent": "nodo-retail-ingest/1.0",
      },
    });
  }

  async listStores(): Promise<ExternalStore[]> {
    this.throwIfCircuitOpen();
    try {
      const res = await this.http.get<ExternalStore[] | { data: ExternalStore[] }>("/api/stores");
      this.markUp();
      const body = res.data;
      if (Array.isArray(body)) return body;
      if (body && Array.isArray((body as { data: ExternalStore[] }).data)) {
        return (body as { data: ExternalStore[] }).data;
      }
      this.logger.warn("Respuesta inesperada de /api/stores");
      return [];
    } catch (err) {
      throw this.wrap(err);
    }
  }

  async listStoreProducts(storeId: number, page: number, limit = 50): Promise<ProductsPage | null> {
    this.throwIfCircuitOpen();
    try {
      const res = await this.http.get<{
        success?: boolean;
        message?: string;
        data?: ProductsPage;
      }>(`/api/products/tienda/${storeId}`, { params: { page, limit } });

      this.markUp();
      if (res.status === 404) return null;
      const data = res.data?.data;
      if (!data) return null;
      return {
        currentPage: data.currentPage ?? page,
        totalPages: data.totalPages ?? page,
        totalItems: data.totalItems ?? (data.products?.length ?? 0),
        hasNextPage: Boolean(data.hasNextPage),
        products: Array.isArray(data.products) ? data.products : [],
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throw this.wrap(err);
    }
  }

  private throwIfCircuitOpen() {
    if (Date.now() < this.downUntil) {
      throw new RetailSourceUnavailableError(this.downReason);
    }
  }

  private markUp() {
    this.downUntil = 0;
    this.downReason = "";
  }

  private wrap(err: unknown): Error {
    const described = describeRetailSourceError(err);
    if (!described.unavailable) {
      return err instanceof Error ? err : new Error(described.message);
    }
    this.downUntil = Date.now() + CIRCUIT_MS;
    this.downReason = described.message;
    this.logger.warn(`Fuente PrecioLíder caída. No se la vuelve a golpear por ${CIRCUIT_MS / 60_000} min.`);
    return new RetailSourceUnavailableError(described.message);
  }
}
