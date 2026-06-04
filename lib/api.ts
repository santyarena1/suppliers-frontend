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

export interface ProductDTO {
  provider: string;
  name: string;
  price: string;
  imageUrl: string;
  externalId: string;
}

export interface CredentialResponse {
  providerName: Provider;
  credentialsJson: string;
}

export interface RegisterResponse {
  id: string;
  username: string;
  role: "ROLE_USER" | "ROLE_ADMIN";
}

// --- Auth ---
export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ success: boolean; data: { token: string } }>("/auth/login", { username, password }),
  register: (username: string, password: string) =>
    api.post<{ success: boolean; data: RegisterResponse }>("/auth/register", { username, password }),
};

// --- Search ---
export const searchApi = {
  all: (name: string) =>
    api.get<ProductDTO[]>("/search/all", { params: { name } }),
  byProvider: (provider: Provider, name: string) =>
    api.get<ProductDTO[]>(`/search/provider/${provider}`, { params: { name } }),
  filtered: (name: string, filters: Record<string, boolean>) =>
    api.post<ProductDTO[]>(`/search/${encodeURIComponent(name)}`, filters),
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

// --- Admin / Users ---
export const userApi = {
  updateActiveStatus: (userId: string, active: boolean) =>
    api.put("/user/update-active-status", { userId, active }),
  updateEndDate: (userId: string, endDate: string) =>
    api.put("/user/update-end-date", { userId, endDate }),
  delete: (userId: string) =>
    api.delete("/user/delete", { data: { userId } }),
};

// --- Invid Sync ---
export const invidApi = {
  sync: (userId: string) => api.get(`/sync/invid/${userId}`),
  search: (title: string) =>
    api.get<ProductDTO[]>(`/sync/invid/search/${encodeURIComponent(title)}`),
};

export default api;
