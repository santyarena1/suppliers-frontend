import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosInstance } from "axios";

const DEFAULT_BASE = "https://api.preciolider.com.ar";

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

  constructor(config: ConfigService) {
    const baseURL = (config.get<string>("RETAIL_SOURCE_BASE_URL") || DEFAULT_BASE).replace(/\/$/, "");
    this.http = axios.create({
      baseURL,
      timeout: 60_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "nodo-retail-ingest/1.0",
      },
    });
  }

  async listStores(): Promise<ExternalStore[]> {
    const res = await this.http.get<ExternalStore[] | { data: ExternalStore[] }>("/api/stores");
    const body = res.data;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray((body as { data: ExternalStore[] }).data)) {
      return (body as { data: ExternalStore[] }).data;
    }
    this.logger.warn("Respuesta inesperada de /api/stores");
    return [];
  }

  async listStoreProducts(storeId: number, page: number, limit = 50): Promise<ProductsPage | null> {
    try {
      const res = await this.http.get<{
        success?: boolean;
        message?: string;
        data?: ProductsPage;
      }>(`/api/products/tienda/${storeId}`, { params: { page, limit } });

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
      throw err;
    }
  }
}
