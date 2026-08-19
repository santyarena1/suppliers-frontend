import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// El backend envuelve toda respuesta exitosa en { success: true, data }.
// Se desenvuelve acá una sola vez para que el resto del código siga
// trabajando con el payload plano (arrays, objetos) como antes.
api.interceptors.response.use((response) => {
  const body = response.data as unknown;
  if (body && typeof body === "object" && "success" in (body as Record<string, unknown>)) {
    response.data = (body as { data: unknown }).data;
  }
  return response;
});

// --- Types ---
export type Provider =
  | "NEW_BYTES" | "ELIT" | "GRUPO_NUCLEO" | "AIR" | "NEW_TREE"
  | "INVID" | "GC" | "POLYTECH" | "ASHIR" | "HDC"
  | "SOLUTION_BOX" | "DISTECNA" | "CEVEN" | "DIAPSTORE";

export const ALL_PROVIDERS: Provider[] = [
  "NEW_BYTES", "ELIT", "GRUPO_NUCLEO", "AIR", "NEW_TREE",
  "INVID", "GC", "POLYTECH", "ASHIR", "HDC",
  "SOLUTION_BOX", "DISTECNA", "CEVEN", "DIAPSTORE",
];

/** Proveedores con integración real implementada (sincronizan catálogo propio). */
export const IMPLEMENTED_PROVIDERS: Provider[] = ["ELIT", "NEW_BYTES", "GRUPO_NUCLEO", "AIR", "INVID"];

export interface ProductDTO {
  id?: string;
  provider: string;
  name: string;
  price: string | number | null;
  finalPrice?: string | number | null;
  currency?: string | null;
  ivaPercent?: string | number | null;
  imageUrl: string | null;
  productUrl?: string | null;
  externalId: string;
  sku?: string | null;
  partNumber?: string | null;
  ean?: string | null;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  longDescription?: string | null;
  stock?: number | null;
  stockStatus?: string | null;
  locationAir?: string | null;
  warranty?: string | null;
  weight?: string | number | null;
  weightUnit?: string | null;
  height?: string | number | null;
  width?: string | number | null;
  length?: string | number | null;
  dimensionsUnit?: string | null;
  volume?: string | number | null;
  tags?: string | null;
  syncedAt?: string;
}

export interface CredentialResponse {
  providerName: Provider;
  credentialsJson: string;
}

export interface RegisterResponse {
  id: string;
  username: string;
  role: "ROLE_USER" | "ROLE_ADMIN" | "ROLE_BRAND";
}

// --- Auth ---
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string }>("/auth/login", { username, password }),
  register: (username: string, email: string, password: string) =>
    api.post<RegisterResponse>("/auth/register", { username, email, password }),
};

// --- Search ---
export interface SearchAllOptions {
  providers?: Provider[];
  onProviderResult?: (provider: Provider, products: ProductDTO[]) => void;
  onProviderError?: (provider: Provider, error: unknown) => void;
}

export const searchApi = {
  all: async (name: string, opts: SearchAllOptions = {}) => {
    const providers = opts.providers ?? IMPLEMENTED_PROVIDERS;
    const results = await Promise.allSettled(
      providers.map(async (p) => {
        try {
          const r = await api.get<ProductDTO[]>(`/search/provider/${p}`, { params: { name } });
          const data = Array.isArray(r.data) ? r.data : [];
          opts.onProviderResult?.(p, data);
          return { provider: p, data };
        } catch (err) {
          opts.onProviderError?.(p, err);
          throw err;
        }
      })
    );
    const merged: ProductDTO[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") merged.push(...r.value.data);
    }
    return { data: merged };
  },
  byProvider: (provider: Provider, name: string) =>
    api.get<ProductDTO[]>(`/search/provider/${provider}`, { params: { name } }),
  filtered: async (name: string, filters: Record<string, boolean>, opts: SearchAllOptions = {}) => {
    const providers = IMPLEMENTED_PROVIDERS.filter((p) => filters[p]);
    return searchApi.all(name, { ...opts, providers });
  },
};

// --- Credentials ---
export const credentialsApi = {
  mine: () => api.get<CredentialResponse[]>("/credentials/me"),
  getByProvider: (providerName: Provider) =>
    api.get<CredentialResponse>(`/credentials/${providerName}`),
  save: (providerName: Provider, credentials: Record<string, string>) =>
    api.post<CredentialResponse>("/credentials", { providerName, credentials }),
  delete: (providerName: Provider) =>
    api.delete(`/credentials/${providerName}`),
};

// --- Proveedores: sincronización de catálogo completo ---
export interface ProviderSyncResult {
  provider: Provider;
  synced: number;
}

export interface ProviderStatus {
  provider: Provider;
  implemented: boolean;
  hasCredentials: boolean;
  total: number;
  withStock: number;
  lastSyncedAt: string | null;
}

export type MissingProductAction = "KEEP" | "OUT_OF_STOCK" | "HIDE" | "DELETE";
export type ZeroStockAction = "KEEP" | "HIDE" | "DELETE";

export interface ProviderConfig {
  provider: Provider;
  enabled: boolean;
  syncIntervalMinutes: number;
  missingProductAction: MissingProductAction;
  zeroStockAction: ZeroStockAction;
  priceMarkupPercent: number | string;
  minStockThreshold: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  lastSyncCreated: number;
  lastSyncUpdated: number;
}

export const providersApi = {
  sync: (providerName: Provider) =>
    api.post<ProviderSyncResult>(`/providers/${providerName}/sync`),
  status: (providerName: Provider) =>
    api.get<ProviderStatus>(`/providers/${providerName}/status`),
  getConfig: (providerName: Provider) =>
    api.get<ProviderConfig>(`/providers/${providerName}/config`),
  updateConfig: (providerName: Provider, config: Partial<ProviderConfig>) =>
    api.put<ProviderConfig>(`/providers/${providerName}/config`, config),
  clearZeroStock: (providerName: Provider) =>
    api.post<{ provider: Provider; deleted: number }>(`/providers/${providerName}/clear-zero-stock`),
  deleteAllProducts: (providerName: Provider) =>
    api.delete<{ provider: Provider; deleted: number }>(`/providers/${providerName}/products`),
};

// --- Admin / Users ---
export const userApi = {
  updateActiveStatus: (userId: string, active: boolean) =>
    api.put("/user/update-active-status", { userId, active }),
  updateEndDate: (userId: string, endDate: string) =>
    api.put("/user/update-end-date", { userId, endDate }),
  delete: (userId: string) =>
    api.delete("/user/delete", { data: { userId } }),
};

// --- Catálogo: producto individual + historial de precio ---
export interface PricePoint {
  price: string | number | null;
  finalPrice: string | number | null;
  currency: string | null;
  capturedAt: string;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export const catalogApi = {
  getProduct: (provider: Provider, externalId: string) =>
    api.get<ProductDTO>(`/providers/${provider}/products/${externalId}`),
  priceHistory: (provider: Provider, externalId: string) =>
    api.get<PricePoint[]>(`/providers/${provider}/products/${externalId}/price-history`),
  categories: () => api.get<CategoryCount[]>("/catalog/categories"),
  featured: (take = 24) => api.get<ProductDTO[]>("/catalog/featured", { params: { take } }),
  byCategory: (category: string, take = 60) => api.get<ProductDTO[]>("/catalog/by-category", { params: { category, take } }),
  providerDisplay: () => api.get<ProviderDisplay[]>("/catalog/provider-display"),
};

// --- Permisos por módulo del usuario actual ---
export type ModuleKey = "search" | "cart" | "credentials" | "providers" | "brands" | "diagnostics" | "admin";

export const permissionsApi = {
  mine: () => api.get<ModuleKey[]>("/me/permissions"),
};

// --- Banners (home / buscador) ---
export interface Banner {
  id: string;
  position: "home" | "search";
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  linkUrl: string | null;
  order: number;
  active: boolean;
}

export const bannersApi = {
  list: (position?: "home" | "search") => api.get<Banner[]>("/banners", { params: position ? { position } : undefined }),
};

// --- Panel de superadmin ---
export type UserRole = "ROLE_USER" | "ROLE_ADMIN" | "ROLE_BRAND";

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  active: boolean;
  endDate: string | null;
  createdAt: string;
}

export interface ProviderDisplay {
  provider: Provider;
  visible: boolean;
  logoUrl: string | null;
  textColor: string | null;
}

export interface BrandDisplay {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  textColor: string | null;
  visible: boolean;
}

export interface ModulePermission {
  module: ModuleKey;
  allowed: boolean;
}

export const adminApi = {
  listUsers: () => api.get<AdminUser[]>("/admin/users"),
  createUser: (data: { username: string; email: string; password: string; role: UserRole }) =>
    api.post<AdminUser>("/admin/users", data),
  updateRole: (userId: string, role: UserRole) =>
    api.put<{ id: string; role: UserRole }>(`/admin/users/${userId}/role`, { role }),
  updateActiveStatus: (userId: string, active: boolean) =>
    api.put(`/admin/users/${userId}/active-status`, { active }),
  updateEndDate: (userId: string, endDate: string) =>
    api.put(`/admin/users/${userId}/end-date`, { endDate }),
  deleteUser: (userId: string) => api.delete(`/admin/users/${userId}`),

  getPermissions: (userId: string) => api.get<ModulePermission[]>(`/admin/permissions/${userId}`),
  updatePermissions: (userId: string, permissions: ModulePermission[]) =>
    api.put<ModulePermission[]>(`/admin/permissions/${userId}`, { permissions }),

  listProviderDisplay: () => api.get<ProviderDisplay[]>("/admin/providers/display"),
  updateProviderDisplay: (provider: Provider, data: Partial<Pick<ProviderDisplay, "visible" | "logoUrl" | "textColor">>) =>
    api.put<ProviderDisplay>(`/admin/providers/${provider}/display`, data),

  listBrandDisplay: () => api.get<BrandDisplay[]>("/admin/brands/display"),
  updateBrandDisplay: (brandId: string, data: Partial<Pick<BrandDisplay, "visible" | "logoUrl" | "textColor">>) =>
    api.put<BrandDisplay>(`/admin/brands/${brandId}/display`, data),

  listBanners: () => api.get<Banner[]>("/admin/banners"),
  createBanner: (data: Omit<Banner, "id" | "active"> & { active?: boolean }) => api.post<Banner>("/admin/banners", data),
  updateBanner: (id: string, data: Partial<Omit<Banner, "id">>) => api.put<Banner>(`/admin/banners/${id}`, data),
  deleteBanner: (id: string) => api.delete(`/admin/banners/${id}`),
};

export default api;
