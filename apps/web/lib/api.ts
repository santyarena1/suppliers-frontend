import axios from "axios";
import { getToken, isTokenExpired, persistAuthCookie, stopImpersonation } from "./auth";

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
api.interceptors.response.use(
  (response) => {
    const body = response.data as unknown;
    if (body && typeof body === "object" && "success" in (body as Record<string, unknown>)) {
      response.data = (body as { data: unknown }).data;
    }
    return response;
  },
  (error) => {
    // Un 401 no siempre es "tu sesión de NODO murió". El carrito calienta
    // checkout de varios portales: si alguno contesta 401 y el JWT nuestro
    // sigue vivo, echar al usuario parece un cierre de sesión al tocar el
    // carrito. Solo limpiamos cuando el token falta o ya venció.
    if (typeof window !== "undefined" && error?.response?.status === 401 && window.location.pathname !== "/login") {
      const url = String(error?.config?.url ?? "");
      if (url.includes("/auth/login") || url.includes("/auth/register")) {
        return Promise.reject(error);
      }
      if (!isTokenExpired(getToken(), 0)) {
        return Promise.reject(error);
      }
      if (stopImpersonation()) {
        persistAuthCookie();
        window.location.href = "/admin?impersonacion=vencida";
        return Promise.reject(error);
      }
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      document.cookie = "tgs_auth=; Path=/; Max-Age=0; SameSite=Lax";
      window.location.href = "/login?expired=1";
    }
    return Promise.reject(error);
  }
);

export async function downloadAuthedFile(pathWithQuery: string, filename: string) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok || ct.includes("application/json")) {
    let message = `No se pudo descargar (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function uploadAuthedFile(path: string, file: File, extra?: Record<string, string>) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const form = new FormData();
  form.append("file", file);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
  }
  const res = await fetch(`${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: unknown };
  if (!res.ok || body.success === false) {
    throw new Error(body.message || `No se pudo subir (${res.status})`);
  }
  return body.data ?? body;
}

export async function uploadAuthedFiles(
  path: string,
  files: { field: string; file: File }[],
  extra?: Record<string, string>
) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const form = new FormData();
  for (const { field, file } of files) form.append(field, file, file.name);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
  }
  const res = await fetch(`${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; data?: unknown };
  if (!res.ok || body.success === false) {
    throw new Error(body.message || `No se pudo subir (${res.status})`);
  }
  return body.data ?? body;
}

export const assetsApi = {
  upload: (file: File) =>
    uploadAuthedFile("/assets/upload", file) as Promise<{ url: string }>,
  uploadFile: (file: File) =>
    uploadAuthedFile("/assets/upload-file", file) as Promise<{
      url: string;
      filename: string;
      mimeType: string;
      byteSize: number;
      kind: "IMAGE" | "FILE";
    }>,
};

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

/** Nombre comercial normalizado de cada proveedor. Es lo único que se muestra en pantalla. */
export const PROVIDER_LABELS: Record<Provider, string> = {
  NEW_BYTES: "New Bytes",
  ELIT: "Elit",
  GRUPO_NUCLEO: "Grupo Núcleo",
  AIR: "Air",
  NEW_TREE: "New Tree",
  INVID: "Invid",
  GC: "GC",
  POLYTECH: "Polytech",
  ASHIR: "Ashir",
  HDC: "HDC",
  SOLUTION_BOX: "Solution Box",
  DISTECNA: "Distecna",
  CEVEN: "Ceven",
  DIAPSTORE: "Diapstore",
};

/** Proveedores con integración real implementada (sincronizan catálogo propio). */
export const IMPLEMENTED_PROVIDERS: Provider[] = [
  "ELIT", "NEW_BYTES", "GRUPO_NUCLEO", "AIR", "INVID", "CEVEN", "DIAPSTORE",
];

export interface ProductDTO {
  id?: string;
  provider: string;
  name: string;
  price: string | number | null;
  finalPrice?: string | number | null;
  currency?: string | null;
  ivaPercent?: string | number | null;
  taxes?: {
    kind: "iva" | "internos" | "iibb" | "other";
    label: string;
    percent: number | null;
    unitAmount: number;
  }[];
  /** Payload crudo del proveedor. No persistir en el carrito. */
  raw?: unknown;
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
  /** Presente en destacados cuando el precio del distribuidor bajó vs la sync anterior. */
  previousPrice?: number | null;
  previousFinalPrice?: number | null;
  priceDropPercent?: number | null;
  /** Marca/categoría unificada (superadmin). Si falta, usar brand/category crudos. */
  displayBrand?: string | null;
  displayCategory?: string | null;
  displaySubcategory?: string | null;
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
  refresh: () => api.post<{ token: string }>("/auth/refresh", {}),
};

// --- Search ---
export interface SearchAllOptions {
  providers?: Provider[];
  includeOutOfStock?: boolean;
  brand?: string;
  onProviderResult?: (provider: Provider, products: ProductDTO[]) => void;
  onProviderError?: (provider: Provider, error: unknown) => void;
}

function searchParams(name: string, opts: { includeOutOfStock?: boolean; brand?: string } = {}) {
  const params: Record<string, string | boolean> = {};
  if (name) params.name = name;
  if (opts.brand) params.brand = opts.brand;
  if (opts.includeOutOfStock) params.includeOutOfStock = true;
  return params;
}

export const searchApi = {
  all: async (name: string, opts: SearchAllOptions = {}) => {
    // Buscar en un proveedor que no está vinculado no devolvería nada igual; sin la
    // lista, serían catorce pedidos al pedo en cada búsqueda.
    const providers = opts.providers ?? (await loadLinkedProviders());
    const results = await Promise.allSettled(
      providers.map(async (p) => {
        try {
          const r = await api.get<ProductDTO[]>(`/search/provider/${p}`, {
            params: searchParams(name, { includeOutOfStock: opts.includeOutOfStock, brand: opts.brand }),
          });
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
  byProvider: (provider: Provider, name: string, opts: { includeOutOfStock?: boolean } = {}) =>
    api.get<ProductDTO[]>(`/search/provider/${provider}`, {
      params: searchParams(name, opts),
    }),
  filtered: async (name: string, filters: Record<string, boolean>, opts: SearchAllOptions = {}) => {
    const providers = (await loadLinkedProviders()).filter((p) => filters[p]);
    return searchApi.all(name, { ...opts, providers });
  },
};

// --- Mi organización ---
export type IvaAdjustment = "REMOVE" | "HALF" | "FLAT_10_5";

/** Un proveedor tal como lo ve un comercio, y por qué lo ve. */
export interface VisibleProvider {
  provider: Provider;
  name: string;
  /** Hay vínculo: se le puede cargar la cuenta y traer catálogo. */
  linked: boolean;
  /** Aparece solo porque el distribuidor pagó publicidad. */
  advertised: boolean;
  accountManager: { name: string; email: string } | null;
  discountPercent: number | null;
  /** Vínculo comercial, para abrir el chat. Ausente si solo hay publicidad. */
  linkId?: string | null;
  /** Pedido offline / esquema que configuró este comercio para el distribuidor. */
  purchase?: {
    acceptsOffline: boolean;
    acceptsScheme: boolean;
    offlineIvaAdjustment: IvaAdjustment | null;
    schemeIvaAdjustment: IvaAdjustment | null;
    schemeDiscountPercent: number | null;
  };
}

export interface RedeemedCode {
  linkId: string;
  tenantName: string;
  tenantType: TenantType;
  provider: Provider | null;
}

export const myApi = {
  providers: () => api.get<VisibleProvider[]>("/my/providers"),
  redeemCode: (code: string) => api.post<RedeemedCode>("/my/redeem-code", { code }),
  org: () => api.get<OwnOrg>("/my/org"),
  updateOrg: (data: Partial<{ contactEmail: string | null; contactPhone: string | null }>) =>
    api.put<OwnOrg>("/my/org", data),
  team: () => api.get<OwnTeam>("/my/team"),
  addMember: (data: { username: string; email: string; password?: string; role: TenantRole; title?: string }) =>
    api.post<TenantMember & { generatedPassword?: string }>("/my/team", data),
  updateMember: (membershipId: string, data: Partial<{ role: TenantRole; title: string | null; active: boolean }>) =>
    api.put<TenantMember>(`/my/team/${membershipId}`, data),
  removeMember: (membershipId: string) => api.delete(`/my/team/${membershipId}`),
  resetMemberPassword: (membershipId: string) =>
    api.post<{ membershipId: string; generatedPassword: string }>(`/my/team/${membershipId}/password`),
  setManagedBrands: (membershipId: string, brandNames: string[]) =>
    api.put(`/my/team/${membershipId}/managed-brands`, { brandNames }),
  accessCodes: () => api.get<{ canManage: boolean; codes: TenantAccessCode[] }>("/my/access-codes"),
  createAccessCode: (data: { label?: string; maxUses?: number; expiresInDays?: number }) =>
    api.post<TenantAccessCode>("/my/access-codes", data),
  revokeAccessCode: (codeId: string) => api.delete(`/my/access-codes/${codeId}`),
  clients: () => api.get<OwnPortfolio>("/my/clients"),
  client: (linkId: string) => api.get<OwnClientDetail>(`/my/clients/${linkId}`),
  updateClient: (
    linkId: string,
    data: Partial<{ accountManagerId: string | null; status: TenantLinkStatus; discountPercent: number | null; notes: string | null }>
  ) => api.put<OwnClient>(`/my/clients/${linkId}`, data),
  clientOrders: (linkId?: string, scope?: "brands" | "all") => {
    const q = new URLSearchParams();
    if (linkId) q.set("linkId", linkId);
    if (scope) q.set("scope", scope);
    const qs = q.toString();
    return api.get<OwnClientOrder[]>(qs ? `/my/clients/orders?${qs}` : "/my/clients/orders");
  },
};

export type ChatKind = "TEXT" | "IMAGE" | "FILE" | "ORDER" | "PRODUCT" | "SYSTEM";

export interface ChatThreadSummary {
  threadId: string | null;
  linkId: string;
  status: TenantLinkStatus;
  peer: {
    userId: string;
    username: string;
    name: string;
    role: TenantRole | null;
    roleLabel: string;
    orgName: string;
    type: TenantType;
    contactEmail: string | null;
    contactPhone: string | null;
    isAccountManager: boolean;
  };
  accountManager: { id: string; username: string; email: string } | null;
  lastMessage: { kind: ChatKind; text: string; author: string | null } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  peerOnline?: boolean;
  peerHref?: string | null;
}

export interface ChatReaction {
  emoji: string;
  users: { id: string; username: string }[];
}

export interface ChatMessage {
  id: string;
  threadId: string;
  kind: ChatKind;
  body: string;
  payload: Record<string, unknown> | null;
  author: { id: string; username: string } | null;
  replyTo: { id: string; body: string; kind: ChatKind; author: string | null } | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reactions?: ChatReaction[];
  peerName?: string;
  pending?: boolean;
  failed?: boolean;
}

export interface ChatThreadDetail {
  threadId: string;
  linkId: string;
  status: TenantLinkStatus;
  canWrite: boolean;
  peer: ChatThreadSummary["peer"];
  accountManager: ChatThreadSummary["accountManager"];
  lastReadAt: string | null;
  peerLastReadAt?: string | null;
  peerReads?: { userId: string; username: string; lastReadAt: string }[];
  peerOnline?: boolean;
  peerHref?: string | null;
  pins: ChatMessage[];
}

export const CHAT_REACTION_EMOJIS = ["👍", "✅", "👀", "❓", "🔥", "❤️"] as const;

export const chatApi = {
  threads: () => api.get<{ canWrite: boolean; unreadTotal: number; threads: ChatThreadSummary[] }>("/my/chat/threads"),
  unread: () => api.get<{ unreadTotal: number }>("/my/chat/unread"),
  search: (q: string) => api.get<{ messages: ChatMessage[] }>(`/my/chat/search?q=${encodeURIComponent(q)}`),
  open: (linkId: string, peerUserId?: string) =>
    api.post<ChatThreadDetail>("/my/chat/open", { linkId, peerUserId }),
  peers: (linkId: string) =>
    api.get<{
      linkId: string;
      peers: {
        userId: string;
        username: string;
        role: TenantRole;
        roleLabel: string;
        isAccountManager: boolean;
        isDefault: boolean;
        hasThread: boolean;
      }[];
    }>(`/my/chat/peers?linkId=${encodeURIComponent(linkId)}`),
  thread: (threadId: string) => api.get<ChatThreadDetail>(`/my/chat/threads/${threadId}`),
  messages: (threadId: string, before?: string) =>
    api.get<{ hasMore: boolean; messages: ChatMessage[] }>(
      `/my/chat/threads/${threadId}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`
    ),
  send: (threadId: string, data: { body?: string; kind?: ChatKind; payload?: Record<string, unknown>; replyToId?: string }) =>
    api.post<ChatMessage>(`/my/chat/threads/${threadId}/messages`, data),
  read: (threadId: string) => api.post(`/my/chat/threads/${threadId}/read`),
  typing: (threadId: string) => api.post(`/my/chat/threads/${threadId}/typing`),
  pin: (threadId: string, messageId: string) => api.post<ChatThreadDetail>(`/my/chat/threads/${threadId}/pins`, { messageId }),
  unpin: (threadId: string, messageId: string) => api.delete<ChatThreadDetail>(`/my/chat/threads/${threadId}/pins/${messageId}`),
  edit: (messageId: string, body: string) => api.patch<ChatMessage>(`/my/chat/messages/${messageId}`, { body }),
  remove: (messageId: string) => api.delete<ChatMessage>(`/my/chat/messages/${messageId}`),
  react: (messageId: string, emoji: string) => api.post<ChatMessage>(`/my/chat/messages/${messageId}/reactions`, { emoji }),
  shareOrder: (orderId: string, threadId?: string) => api.post<ChatMessage>("/my/chat/share-order", { orderId, threadId }),
  upload: (file: File) =>
    uploadAuthedFile("/my/chat/upload", file) as Promise<{
      url: string;
      filename: string;
      mimeType: string;
      byteSize: number;
      kind: "IMAGE" | "FILE";
    }>,
};

export interface OrgCartSnapshot {
  tenantId: string;
  items: unknown[];
  schemes: unknown[];
  updatedByUserId: string | null;
  updatedAt: string | null;
}

export const orgCartApi = {
  get: () => api.get<OrgCartSnapshot>("/cart/org"),
  save: (data: { items: unknown[]; schemes: unknown[] }) => api.put<OrgCartSnapshot>("/cart/org", data),
  client: (linkId: string) => api.get<OrgCartSnapshot>(`/cart/clients/${linkId}`),
};

export interface AdSlot {
  id: string;
  key: string;
  name: string;
  description: string;
  placement: string;
  monthlyPriceUsd: number;
  maxConcurrent: number;
  enabled: boolean;
}

export interface AdCampaign {
  id: string;
  tenantId: string;
  advertiser?: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";
  title: string;
  subtitle: string;
  imageUrl: string | null;
  linkUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  slot: { id: string; key: string; name: string; placement: string; monthlyPriceUsd: number };
  stats?: { impressions: number; clicks: number };
}

export interface AdCreative {
  campaignId: string;
  slot: string;
  placement: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  linkUrl: string | null;
  advertiser: string;
  provider: string | null;
}

export const adsApi = {
  mine: () =>
    api.get<{ allowed: boolean; monthlyDue: number; slots: AdSlot[]; campaigns: AdCampaign[] }>("/my/ads"),
  createCampaign: (data: {
    slotId: string;
    title: string;
    subtitle?: string;
    imageUrl?: string;
    linkUrl?: string;
    status?: AdCampaign["status"];
  }) => api.post<AdCampaign>("/my/ads/campaigns", data),
  updateCampaign: (
    id: string,
    data: {
      slotId: string;
      title: string;
      subtitle?: string;
      imageUrl?: string;
      linkUrl?: string;
      status?: AdCampaign["status"];
    }
  ) => api.put<AdCampaign>(`/my/ads/campaigns/${id}`, data),
  creatives: (placement?: string) =>
    api.get<AdCreative[]>(placement ? `/ads/creatives?placement=${encodeURIComponent(placement)}` : "/ads/creatives"),
  track: (campaignId: string, kind: "impression" | "click", path?: string) =>
    api.post(`/ads/campaigns/${campaignId}/track`, { kind, path }),
};

export const adminAdsApi = {
  list: () => api.get<{ slots: AdSlot[]; campaigns: AdCampaign[] }>("/admin/ads"),
  updateSlot: (slotId: string, data: Partial<Pick<AdSlot, "enabled" | "monthlyPriceUsd" | "maxConcurrent" | "name" | "description">>) =>
    api.put<AdSlot>(`/admin/ads/slots/${slotId}`, data),
};

export interface OwnOrg {
  id: string;
  name: string;
  type: TenantType;
  contactEmail: string | null;
  contactPhone: string | null;
  advertisingEnabled: boolean;
  providerKey: Provider | null;
  tenantRole: TenantRole;
  canManageTeam: boolean;
  canManagePortfolio: boolean;
}

export interface OwnTeam {
  canManage: boolean;
  members: TenantMember[];
}

export interface OwnClient {
  linkId: string;
  status: TenantLinkStatus;
  discountPercent: number | null;
  notes: string | null;
  accountManager: { id: string; username: string; email: string } | null;
  client: { id: string; name: string; type: TenantType; contactEmail?: string | null; contactPhone?: string | null };
  ordersCount?: number;
  lastOrderAt?: string | null;
  lastOrderTotal?: number | null;
  inactive?: boolean;
  inBrandScope?: boolean;
  canEditTerms?: boolean;
  canAssignSeller?: boolean;
}

export interface OwnPortfolio {
  canManage: boolean;
  canAssignSeller: boolean;
  canEditTerms: boolean;
  isProductManager?: boolean;
  managedBrands?: string[];
  sellers: { userId: string; username: string; email: string; tenantRole: TenantRole; title: string | null }[];
  clients: OwnClient[];
}

export interface OwnClientOrder {
  id: string;
  provider: Provider;
  providerName: string;
  status: string;
  approvalStatus: OrderApprovalStatus;
  total: number | null;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: string;
  clientName?: string | null;
  linkId?: string | null;
  linkStatus?: TenantLinkStatus | null;
  inBrandScope?: boolean;
}

export interface OwnClientDetail extends OwnClient {
  orders: OwnClientOrder[];
}

export type OrderApprovalStatus = "NOT_REQUIRED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export type OrderChannel = "ONLINE" | "OFFLINE";

/** Pedido de la organización, con la aprobación interna del comercio. */
export interface TenantOrder {
  id: string;
  provider: Provider;
  providerName: string;
  status: string;
  approvalStatus: OrderApprovalStatus;
  channel?: OrderChannel;
  editable?: boolean;
  orderNumber: string | null;
  webOrderNumber: string | null;
  paymentLabel: string | null;
  deliveryLabel: string | null;
  notes: string | null;
  total: number | null;
  quoteRate?: number | null;
  errorMessage: string | null;
  rejectionReason: string | null;
  items: {
    name?: string;
    qty?: number;
    code?: string;
    externalId?: string;
    sku?: string;
    /** Neto unitario (offline). */
    unitPrice?: number;
    /** Neto unitario (checkouts online). */
    price?: number;
    priceUsd?: number;
    unitPriceUsd?: number;
    lineTotal?: number;
    subtotal?: number;
    total?: number;
    internosAmount?: number;
    ivaPercent?: number;
    iva?: number;
    internosPercent?: number;
    finalLineUsd?: number | null;
    finalPrice?: number | null;
    pricingMode?: "list" | "scheme" | "offline" | null;
    listUnitPrice?: number | null;
    edited?: boolean;
    editedAt?: string | null;
    originalUnitPrice?: number | null;
    originalFinalLineUsd?: number | null;
    editNote?: string | null;
  }[];
  createdBy: string | null;
  approvedBy: string | null;
  approvalDecidedAt: string | null;
  createdAt: string;
}

export type PurchaseChannel = "ONLINE" | "OFFLINE";

export interface PurchaseRankRow {
  key: string;
  label: string;
  spendUsd: number;
  units: number;
  orders: number;
  share: number;
  lastBoughtAt: string | null;
  extraUsd?: number;
  extraArs?: number;
  groupId?: string | null;
  unified?: boolean;
  variants?: { key: string; label: string; orders: number }[];
  avgTicketUsd?: number;
  avgUnitsPerOrder?: number;
  uniqueSkus?: number;
  uniqueBrands?: number;
  uniqueCategories?: number;
  uniqueProviders?: number;
  repeatSkuShare?: number;
  firstBoughtAt?: string | null;
  previousSpendUsd?: number | null;
  spendDeltaPercent?: number | null;
  onlineSpendUsd?: number;
  offlineSpendUsd?: number;
  byMonth?: {
    month: string;
    label: string;
    spendUsd: number;
    orders: number;
    units: number;
    online?: number;
    offline?: number;
  }[];
  byWeekday?: { weekday: number; label: string; spendUsd: number; orders: number }[];
}

export type OpsAliasKind = "ADDRESS" | "PAYMENT" | "DELIVERY" | "WAREHOUSE";

export interface PurchaseProductRow {
  sku: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  provider: string;
  providerName: string;
  qty: number;
  spendUsd: number;
  orders: number;
  lastPaidUsd: number;
  currentUsd: number | null;
  deltaPercent: number | null;
  stock: number | null;
  imageUrl: string | null;
  lastBoughtAt: string;
}

export interface PurchaseInsights {
  tenantName: string;
  periodDays: number;
  generatedAt: string;
  truncated: boolean;
  kpis: {
    spendUsd: number;
    orderTotalUsd: number;
    orders: number;
    units: number;
    avgTicketUsd: number;
    uniqueSkus: number;
    uniqueBrands: number;
    uniqueCategories: number;
    providersUsed: number;
    repeatSkuShare: number;
    avgUnitsPerOrder: number;
    catalogSkus: number;
    catalogInStock: number;
    lastSyncAt: string | null;
    previousSpendUsd: number | null;
    spendDeltaPercent: number | null;
    shippingUsd?: number;
    shippingArs?: number;
    shippingOrders?: number;
    pickupOrders?: number;
    avgShippingUsd?: number;
    avgShippingArs?: number;
    taxesUsd?: number;
    perceptionsUsd?: number;
    uniqueAddresses?: number;
    uniquePayments?: number;
  };
  ops?: {
    kpis: {
      shippingUsd: number;
      shippingArs: number;
      shippingOrders: number;
      pickupOrders: number;
      unknownFulfillment: number;
      avgShippingUsd: number;
      avgShippingArs: number;
      taxesUsd: number;
      perceptionsUsd: number;
      subtotalUsd: number;
      uniqueAddresses: number;
      uniquePayments: number;
      dropShippingOrders: number;
      customerSaleOrders: number;
      withNotes: number;
      uniqueBuyers: number;
      shippingKnownOrders: number;
    };
    fulfillmentMix: { key: string; label: string; orders: number; spendUsd: number; share: number }[];
    byPayment: PurchaseRankRow[];
    byDelivery: PurchaseRankRow[];
    byAddress: PurchaseRankRow[];
    byWarehouse: PurchaseRankRow[];
    byBuyer: PurchaseRankRow[];
    byHour: { hour: number; label: string; orders: number; spendUsd: number }[];
    shippingByMonth: { month: string; label: string; shippingUsd: number; shippingArs: number; shippedOrders: number; pickupOrders: number }[];
    shippingByProvider: { provider: string; label: string; shippingUsd: number; shippingArs: number; orders: number; spendUsd: number }[];
    suggestions?: { kind: OpsAliasKind; keys: string[]; labels: string[]; reason: string }[];
  };
  concentration: {
    providers: { top1: number; top5: number; top10: number };
    brands: { top1: number; top5: number; top10: number };
  };
  channelMix: { channel: PurchaseChannel; spendUsd: number; orders: number; share: number }[];
  byMonth: {
    month: string;
    label: string;
    spendUsd: number;
    orders: number;
    units: number;
    online: number;
    offline: number;
  }[];
  byMonthDay?: { day: number; label: string; spendUsd: number; orders: number; units: number }[];
  byWeekday: { weekday: number; label: string; spendUsd: number; orders: number }[];
  byProvider: (PurchaseRankRow & { provider: string; catalogSkus: number; catalogInStock: number })[];
  byBrand: PurchaseRankRow[];
  byCategory: PurchaseRankRow[];
  bySubcategory: PurchaseRankRow[];
  brandProviders: { brand: string; provider: string; spendUsd: number; units: number }[];
  topProducts: PurchaseProductRow[];
  recentOrders: {
    id: string;
    provider: string;
    providerName: string;
    channel: PurchaseChannel;
    createdAt: string;
    spendUsd: number;
    units: number;
    skus: number;
  }[];
}

export interface PendingApprovals {
  /** Quien mira puede firmar los pedidos que armaron otros. */
  canApprove: boolean;
  /** Lo que arme esta persona va a quedar esperando una firma. */
  needsApproval: boolean;
  orders: TenantOrder[];
}

export const ordersApi = {
  list: () => api.get<TenantOrder[]>("/orders"),
  pending: () => api.get<PendingApprovals>("/orders/pending-approval"),
  insights: (days = 90) => api.get<PurchaseInsights>("/orders/insights", { params: { days } }),
  unifyAlias: (body: { kind: OpsAliasKind; keys: string[]; label: string }) =>
    api.put<{ groupId: string; kind: OpsAliasKind; label: string; keys: string[] }>("/orders/insights/aliases", body),
  renameAlias: (groupId: string, label: string) =>
    api.patch<{ groupId: string; label: string }>(`/orders/insights/aliases/${groupId}`, { label }),
  splitAlias: (groupId: string, keys: string[]) =>
    api.post<{ groupId: string }>(`/orders/insights/aliases/${groupId}/split`, { keys }),
  deleteAlias: (groupId: string) =>
    api.delete<{ groupId: string; deleted: number }>(`/orders/insights/aliases/${groupId}`),
  createOffline: (orders: {
    provider: Provider | string;
    notes?: string;
    quoteRate?: number;
    items: {
      externalId: string;
      sku?: string;
      name: string;
      qty: number;
      unitPrice: number;
      internosAmount?: number;
      ivaPercent?: number;
      internosPercent?: number;
    }[];
  }[]) => api.post<TenantOrder[]>("/orders/offline", { orders }),
  updateOffline: (id: string, body: {
    notes?: string;
    items?: {
      externalId: string;
      sku?: string;
      name: string;
      qty: number;
      unitPrice: number;
      internosAmount?: number;
      ivaPercent?: number;
      internosPercent?: number;
      finalLineUsd?: number;
      pricingMode?: "list" | "scheme" | "offline";
      listUnitPrice?: number;
      edited?: boolean;
      editedAt?: string;
      originalUnitPrice?: number;
      originalFinalLineUsd?: number;
      editNote?: string;
    }[];
  }) => api.patch<TenantOrder>(`/orders/${id}`, body),
  approve: (id: string) => api.post<{ id: string; status: string; message: string }>(`/orders/${id}/approve`, {}),
  reject: (id: string, reason?: string) => api.post<TenantOrder>(`/orders/${id}/reject`, { reason }),
};

/**
 * Los proveedores que existen para esta organización, cacheados: la lista cambia poco
 * y la piden varias pantallas al mismo tiempo.
 */
let visibleProviders: { list: VisibleProvider[]; at: number } | null = null;
let visibleProvidersInflight: Promise<VisibleProvider[]> | null = null;
const VISIBLE_PROVIDERS_TTL_MS = 60_000;

export const MY_PROVIDERS_UPDATED = "nodo:my-providers-updated";

export async function loadMyProviders(force = false): Promise<VisibleProvider[]> {
  if (!force && visibleProviders && Date.now() - visibleProviders.at < VISIBLE_PROVIDERS_TTL_MS) {
    return visibleProviders.list;
  }
  if (!force && visibleProvidersInflight) return visibleProvidersInflight;

  visibleProvidersInflight = myApi
    .providers()
    .then((r) => {
      visibleProviders = { list: r.data, at: Date.now() };
      return r.data;
    })
    .catch(() => visibleProviders?.list ?? [])
    .finally(() => {
      visibleProvidersInflight = null;
    });

  return visibleProvidersInflight;
}

export function invalidateMyProviders() {
  visibleProviders = null;
  visibleProvidersInflight = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MY_PROVIDERS_UPDATED));
  }
}

/** Solo los vinculados: de los publicitados todavía no hay catálogo que traer. */
export async function loadLinkedProviders(): Promise<Provider[]> {
  return (await loadMyProviders()).filter((p) => p.linked).map((p) => p.provider);
}

export function cachedMyProviders(): VisibleProvider[] | null {
  return visibleProviders?.list ?? null;
}

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
  publicCatalog?: boolean;
  hasCredentials: boolean;
  total: number;
  withStock: number;
  lastSyncedAt: string | null;
}

export function canSyncProvider(status?: ProviderStatus | null): boolean {
  return Boolean(status?.hasCredentials || status?.publicCatalog);
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
  acceptsOffline: boolean;
  acceptsScheme: boolean;
  offlineIvaAdjustment: IvaAdjustment | null;
  schemeIvaAdjustment: IvaAdjustment | null;
  schemeDiscountPercent: number | string | null;
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
  importFile: (providerName: Provider, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<ProviderSyncResult & { rowsInFile: number; rowsSkipped: number; unmappedColumns: string[] }>(
      `/providers/${providerName}/import`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
};

// --- Invid: pedidos y cuenta corriente (solo lectura, datos reales de su portal) ---
export interface InvidOrderItem {
  code?: string;
  name: string;
  price?: string;
  qty?: string;
  total?: string;
}
export interface InvidOrderTotals {
  net?: number;
  iva?: number;
  iva105?: number;
  iva21?: number;
  internos?: number;
  percepciones?: number;
  shipping?: number;
  taxes?: number;
  total?: number;
}
export interface InvidOrder {
  orderNumber: string;
  webOrderNumber: string;
  status: string;
  date: string;
  amount: string;
  invoice: string;
  invoiceHrefs?: string[];
  delivery?: string;
  payment?: string;
  items?: InvidOrderItem[];
  links?: { href: string; label: string }[];
  totals?: InvidOrderTotals;
  exchangeRate?: number;
  exchangeRateSource?: "order" | "current";
  amountArs?: number;
  canAttachPayment?: boolean;
  paymentHref?: string;
}
export interface InvidPaymentBank {
  value: string;
  label: string;
}
export interface InvidPaymentForm {
  action: string;
  method: string;
  fields: Record<string, string>;
  banks: InvidPaymentBank[];
  bankField: string;
  notesField: string;
  fileFields: string[];
  notice?: string;
  orderField?: string;
}
export interface InvidFileForm {
  action: string;
  method: string;
  fileField: string;
  fields: Record<string, string>;
}
export interface InvidAccountMovement {
  date: string;
  docType: string;
  docNumber: string;
  internalNumber: string;
  currency: string;
  total: string;
  hrefs?: string[];
}
export const invidAccountApi = {
  orders: (opts?: { refresh?: boolean }) =>
    api.get<{
      orders: InvidOrder[];
      currentExchangeRate?: number;
      paymentForm?: InvidPaymentForm;
      paymentUploads?: InvidFileForm[];
      note?: string;
    }>(
      "/providers/INVID/orders",
      { params: opts?.refresh ? { refresh: 1 } : undefined }
    ),
  accountStatement: (opts?: { refresh?: boolean }) =>
    api.get<{ balance: number | null; movements: InvidAccountMovement[] }>(
      "/providers/INVID/account-statement",
      { params: opts?.refresh ? { refresh: 1 } : undefined }
    ),
};

export interface InvidAddress {
  id: string;
  label: string;
  addressLine: string;
  isDefault: boolean;
}
export interface InvidPaymentOption {
  value: string;
  label: string;
}
export interface InvidCheckoutItem {
  code: string;
  qty: number;
  name: string;
  price: number;
  subtotal: number;
  iva?: number;
  internos?: number;
  percepciones?: number;
}
export interface InvidCheckoutPreview {
  items: InvidCheckoutItem[];
  address: Record<string, string>;
  paymentOption: string;
  paymentLabel: string;
  payments: InvidPaymentOption[];
  deliveries: InvidPaymentOption[];
  expresoCompanies?: InvidPaymentOption[];
  suggestedDelivery?: InvidPaymentOption;
  stockOk: boolean;
  stockMessage?: string;
  subtotal: number;
  iva?: number;
  impuestos: number;
  percepcionPercent?: number;
  percepciones: number;
  shippingCost?: number;
  taxLines?: { nroItem: string; internos: number; subtotal: number; total: number }[];
  itemErrors?: { code: string; name?: string; message: string }[];
  total: number;
  note: string;
}
export interface InvidDraftResult {
  id: string;
  status: string;
  orderNumber: string | null;
  webOrderNumber: string | null;
  paymentLabel: string | null;
  deliveryLabel: string | null;
  items: InvidCheckoutItem[];
  total: number | null;
  message: string;
}
export interface InvidNodoDraft {
  id: string;
  status: string;
  invidOrderNumber: string | null;
  invidWebOrderNumber: string | null;
  paymentLabel: string | null;
  deliveryLabel: string | null;
  notes?: string | null;
  subtotal?: number | null;
  impuestos?: number | null;
  percepciones?: number | null;
  total: string | number | null;
  createdAt: string;
  errorMessage: string | null;
  addressSnapshot?: unknown;
  items?: NewBytesNodoDraft["items"];
}

export const invidCheckoutApi = {
  addresses: () => api.get<InvidAddress[]>("/providers/INVID/checkout/addresses"),
  payments: () => api.get<InvidPaymentOption[]>("/providers/INVID/checkout/payments"),
  deliveries: () => api.get<InvidPaymentOption[]>("/providers/INVID/checkout/deliveries"),
  preview: (body: {
    items: { code: string; qty: number }[];
    addressId: string;
    paymentOption: string;
    deliveryOption?: string;
    expresoId?: string;
  }) => api.post<InvidCheckoutPreview>("/providers/INVID/checkout/preview", body),
  draft: (body: {
    items: { code: string; qty: number; name?: string }[];
    addressId: string;
    paymentOption: string;
    deliveryOption?: string;
    expresoId?: string;
    notes?: string;
    background?: boolean;
  }) => api.post<InvidDraftResult>("/providers/INVID/checkout/draft", body, {
    timeout: body.background ? 30_000 : 180_000,
  }),
  drafts: () => api.get<InvidNodoDraft[]>("/providers/INVID/drafts"),
  draftById: (id: string) => api.get<InvidNodoDraft>(`/providers/INVID/drafts/${id}`),
};

// --- NewBytes: pedidos, comprobantes y checkout (API oficial api.nb.com.ar) ---
export interface NewBytesOrder {
  orderNumber?: string;
  webOrderNumber?: string;
  albNumber?: string;
  branch?: string | number;
  status: string;
  statusDescription?: string;
  date: string;
  amount?: string | number;
  clientName?: string;
  trackingNumber?: string;
  invoice?: string;
  notes?: string;
  payment?: string;
  delivery?: string;
  address?: string;
  dropShipping?: boolean;
  items?: {
    code?: string;
    name: string;
    qty?: number;
    price?: number;
    total?: number;
    iva?: number;
    ivaPercent?: number;
    perception?: number;
  }[];
  subtotalUsd?: number;
  iva?: number;
  perceptions?: number;
  perceptionLabel?: string;
  totalUsd?: number;
  totalArs?: number;
  exchangeRate?: number;
}
export interface NewBytesComprobante {
  voucherId?: string | number;
  invoiceDate?: string;
  invoiceType?: string;
  invoiceNumber?: string;
  invoiceLabel?: string;
  branch?: string | number;
  subtotalUsd?: number;
  totalUsd?: number;
  subtotalArs?: number;
  totalArs?: number;
  perceptions?: number;
  voucherUrl?: string;
}
export interface NewBytesAddress {
  id: string;
  label: string;
  addressLine: string;
  postalCode?: string;
  isDefault: boolean;
}
export interface NewBytesPaymentOption {
  value: string;
  label: string;
  interest: number;
  pickupOnly: boolean;
}
export interface NewBytesCheckoutItem {
  code: string;
  qty: number;
  name: string;
  price: number;
  subtotal: number;
}
export interface NewBytesShippingQuote {
  id: string;
  label: string;
  plazo?: string;
  total?: number;
}
export interface NewBytesDatosBultos {
  weightKg: number;
  sizeCm: string;
  amount: number;
}
export interface NewBytesAvailability {
  ok: boolean;
  issues: { code?: string; message: string }[];
}
export interface NewBytesCartSnapshot {
  items: NewBytesCheckoutItem[];
  payments: NewBytesPaymentOption[];
  addresses: NewBytesAddress[];
  pickup: { value: "pickup"; label: string; addressLine: string; postalCode: string };
  subtotal: number;
  total?: number;
  iva?: number;
  perceptions?: number;
  perceptionLines?: { label: string; amount: number }[];
  stockOk: boolean;
  availability: NewBytesAvailability;
  subtotales: Record<string, unknown> | null;
  note: string;
}
export interface NewBytesCheckoutPreview {
  items: NewBytesCheckoutItem[];
  payments: NewBytesPaymentOption[];
  addresses: NewBytesAddress[];
  delivery: "pickup" | "shipping";
  pickup: { value: "pickup"; label: string; addressLine: string; postalCode: string } | null;
  address: { id: string; label: string; addressLine: string; postalCode?: string } | null;
  quotes: NewBytesShippingQuote[];
  selectedQuote: NewBytesShippingQuote | null;
  datosBultos: NewBytesDatosBultos | null;
  shippingTotal: number | null;
  paymentOption?: string;
  paymentLabel?: string;
  dropShipping: boolean;
  stockOk: boolean;
  availability: NewBytesAvailability;
  subtotal: number;
  total?: number;
  iva?: number;
  perceptions?: number;
  perceptionLines?: { label: string; amount: number }[];
  subtotales: Record<string, unknown> | null;
  note: string;
}
export interface NewBytesDraftResult {
  id: string;
  status: string;
  orderNumber: string | null;
  webOrderNumber: string | null;
  paymentLabel: string | null;
  deliveryLabel: string | null;
  items: NewBytesCheckoutItem[];
  total: string | number | null;
  message: string;
}
export interface NewBytesNodoDraft {
  id: string;
  status: string;
  invidOrderNumber: string | null;
  invidWebOrderNumber: string | null;
  paymentLabel: string | null;
  deliveryLabel: string | null;
  notes?: string | null;
  subtotal?: number | null;
  impuestos?: number | null;
  percepciones?: number | null;
  total: string | number | null;
  createdAt: string;
  errorMessage: string | null;
  addressSnapshot?: unknown;
  items?: {
    code?: string;
    name?: string;
    qty?: number;
    quantity?: number;
    price?: number;
    priceUsd?: number;
    subtotal?: number;
    total?: number;
    iva?: number;
    vat?: number;
    ivaPercent?: number;
    percepciones?: number;
    internos?: number;
    taxes?: { desc?: string; percent?: number }[];
  }[];
}

export const newBytesAccountApi = {
  orders: (opts?: { refresh?: boolean }) =>
    api.get<{ orders: NewBytesOrder[] }>("/providers/NEW_BYTES/orders", {
      params: opts?.refresh ? { refresh: 1 } : undefined,
    }),
  purchaseOrders: (opts?: { refresh?: boolean }) =>
    api.get<{ orders: NewBytesOrder[] }>("/providers/NEW_BYTES/purchase-orders", {
      params: opts?.refresh ? { refresh: 1 } : undefined,
    }),
  accountStatement: (opts?: { refresh?: boolean }) =>
    api.get<{ balance: number | null; movements: NewBytesComprobante[] }>(
      "/providers/NEW_BYTES/account-statement",
      { params: opts?.refresh ? { refresh: 1 } : undefined }
    ),
  orderDetail: (id: string, opts?: { kind?: "orders" | "purchase" }) =>
    api.get<NewBytesOrder & { found: boolean }>(
      `/providers/NEW_BYTES/orders/${encodeURIComponent(id)}`,
      { params: opts?.kind ? { kind: opts.kind } : undefined }
    ),
};

export type NewBytesCheckoutItemInput = { code: string; qty: number; name?: string };
export type NewBytesCheckoutPayload = {
  items: NewBytesCheckoutItemInput[];
  delivery: "pickup" | "shipping";
  medioDePagoId?: number;
  addressId?: string;
  medioDeEnvioId?: number;
  notes?: string;
  dropShipping?: boolean;
  dropShippingClientName?: string;
  dropShippingClientEmail?: string;
  background?: boolean;
};

export const newBytesCheckoutApi = {
  addresses: () => api.get<NewBytesAddress[]>("/providers/NEW_BYTES/checkout/addresses"),
  payments: () => api.get<NewBytesPaymentOption[]>("/providers/NEW_BYTES/checkout/payments"),
  cart: (body: { items: NewBytesCheckoutItemInput[] }) =>
    api.post<NewBytesCartSnapshot>("/providers/NEW_BYTES/checkout/cart", body),
  shipping: (body: { items: NewBytesCheckoutItemInput[]; addressId: string }) =>
    api.post<{ address: NewBytesAddress; quotes: NewBytesShippingQuote[]; datosBultos: NewBytesDatosBultos | null }>(
      "/providers/NEW_BYTES/checkout/shipping",
      body
    ),
  preview: (body: NewBytesCheckoutPayload) =>
    api.post<NewBytesCheckoutPreview>("/providers/NEW_BYTES/checkout/preview", body),
  draft: (body: NewBytesCheckoutPayload & { medioDePagoId: number }) =>
    api.post<NewBytesDraftResult>("/providers/NEW_BYTES/checkout/draft", body, {
      timeout: body.background ? 30_000 : 180_000,
    }),
  drafts: () => api.get<NewBytesNodoDraft[]>("/providers/NEW_BYTES/drafts"),
  draftById: (id: string) => api.get<NewBytesNodoDraft>(`/providers/NEW_BYTES/drafts/${id}`),
};

export type NodoProviderDraft = NewBytesNodoDraft;

export interface ProviderOption {
  value: string;
  label: string;
}

export interface GnPreviewItem {
  code: string;
  qty: number;
  name: string;
  priceUsd: number;
  taxPercent: number;
  stockMdp: number;
  stockCaba: number;
  stock: number;
  stockOk: boolean;
}

export interface GnCheckoutPreview {
  items: GnPreviewItem[];
  stockOk: boolean;
  usdExchange: number | null;
  subtotalUsd: number;
  subtotalArs: number | null;
  customerSale: boolean;
  note: string;
}

export interface GnCustomer {
  nombre: string;
  documento: string;
  tipoDocumento: number;
  direccion: string;
  codigoPostal: string;
  ciudad: string;
  codProvincia: number;
  email: string;
  tel: string;
}

export interface GnDraftResult {
  id: string;
  status: string;
  orderNumber: string | null;
  webOrderNumber: string | null;
  paymentLabel: string | null;
  deliveryLabel: string | null;
  total: string | number | null;
  message: string;
  pedidos?: { pedido: string; centroDistribucion: string }[];
}

export const grupoNucleoAccountApi = {
  account: () =>
    api.get<{ note: string; drafts: NodoProviderDraft[]; orders: unknown[]; movements: unknown[]; balance: number | null }>(
      "/providers/GRUPO_NUCLEO/account"
    ),
};

export const grupoNucleoCheckoutApi = {
  options: () =>
    api.get<{ documentTypes: ProviderOption[]; provinces: { value: number; label: string }[]; note: string }>(
      "/providers/GRUPO_NUCLEO/checkout/options"
    ),
  preview: (body: { items: { code: string; qty: number; name?: string }[]; customerSale?: boolean }) =>
    api.post<GnCheckoutPreview>("/providers/GRUPO_NUCLEO/checkout/preview", body),
  draft: (body: {
    items: { code: string; qty: number; name?: string }[];
    notes?: string;
    customerSale?: boolean;
    customer?: GnCustomer;
    background?: boolean;
  }) => api.post<GnDraftResult>("/providers/GRUPO_NUCLEO/checkout/draft", body, {
    timeout: body.background ? 30_000 : 180_000,
  }),
  drafts: () => api.get<NodoProviderDraft[]>("/providers/GRUPO_NUCLEO/drafts"),
  draftById: (id: string) => api.get<NodoProviderDraft>(`/providers/GRUPO_NUCLEO/drafts/${id}`),
};

export interface AirCheckoutPreview {
  nrocompro: string;
  items: { code: string; qty: number; name: string; price: number; subtotal: number }[];
  subtotal: number;
  total: number;
  iva21: number;
  iva105: number;
  ii: number;
  perceptions?: number;
  paymentLabel: string;
  deliveryLabel: string;
  stockOk: boolean;
  note: string;
  options: {
    sucursales: ProviderOption[];
    vendedores: ProviderOption[];
    pagos: ProviderOption[];
    entregas: ProviderOption[];
    transportes: ProviderOption[];
  };
}

export interface AirDraftResult {
  id: string;
  status: string;
  orderNumber: string | null;
  webOrderNumber: string | null;
  paymentLabel: string | null;
  deliveryLabel: string | null;
  total: string | number | null;
  message: string;
}

export const airAccountApi = {
  account: (opts?: { refresh?: boolean }) =>
    api.get<{
      balance: number | null;
      movements: Record<string, string>[];
      invoices: Record<string, string>[];
      pending: Record<string, string>[];
      drafts: NodoProviderDraft[];
      note: string;
    }>("/providers/AIR/account", { params: opts?.refresh ? { refresh: 1 } : undefined }),
};

export const airCheckoutApi = {
  options: () =>
    api.get<{
      sucursales: ProviderOption[];
      vendedores: ProviderOption[];
      pagos: ProviderOption[];
      entregas: ProviderOption[];
      transportes: ProviderOption[];
    }>("/providers/AIR/checkout/options"),
  preview: (body: {
    items: { code: string; qty: number; name?: string }[];
    sucursal?: string;
    vendedor?: string;
    pago?: string;
    entrega?: string;
    transporte?: string;
    notes?: string;
  }) => api.post<AirCheckoutPreview>("/providers/AIR/checkout/preview", body),
  draft: (body: {
    items: { code: string; qty: number; name?: string }[];
    sucursal: string;
    vendedor: string;
    pago: string;
    entrega: string;
    transporte?: string;
    notes?: string;
    background?: boolean;
  }) => api.post<AirDraftResult>("/providers/AIR/checkout/draft", body, {
    timeout: body.background ? 30_000 : 180_000,
  }),
  drafts: () => api.get<NodoProviderDraft[]>("/providers/AIR/drafts"),
  draftById: (id: string) => api.get<NodoProviderDraft>(`/providers/AIR/drafts/${id}`),
};

export interface ElitCheckoutPreview {
  items: { code: string; qty: number; name: string; price: number; subtotal: number }[];
  warehouses: { id: number; name: string }[];
  shippingMethods: {
    warehouse: number;
    warehouseName: string;
    value: string;
    label: string;
    cost: number;
    selected: boolean;
  }[];
  saleConditions: { value: string; label: string; surcharge: number }[];
  addresses: { code: string; label: string; addressLine: string; postalCode?: string }[];
  warehouse: number | null;
  shippingMethod: string | null;
  shippingLabel: string | null;
  shippingCost: number;
  saleCondition: string | null;
  shippingAddress: string | null;
  subtotal: number;
  vat: number;
  internalTax: number;
  perceptions: number;
  perceptionLines: { label: string; amount: number }[];
  total: number;
  exchange: number | null;
  stockOk: boolean;
  note: string;
}

export interface ElitDraftResult {
  id: string;
  status: string;
  orderNumber: string | null;
  webOrderNumber: string | null;
  paymentLabel: string | null;
  deliveryLabel: string | null;
  total: string | number | null;
  message: string;
}

export const elitAccountApi = {
  account: (opts?: { refresh?: boolean }) =>
    api.get<{
      profile: { id?: string; name?: string; exchange?: number | null };
      balance: number | null;
      balanceUsd?: number | null;
      summary?: ElitCtaSummary;
      usdVouchers?: ElitUsdVoucher[];
      orders: ElitSaleNote[];
      movements: ElitMovement[];
      payments?: ElitPayment[];
      canCreateReport?: boolean;
      drafts: NodoProviderDraft[];
      note: string;
    }>("/providers/ELIT/account", { params: opts?.refresh ? { refresh: 1 } : undefined }),
  saleNote: (number: string) => api.get<ElitSaleNote>(`/providers/ELIT/salenotes/${encodeURIComponent(number)}`),
  payments: () =>
    api.get<{ canCreateReport: boolean; active: unknown; payments: ElitPayment[] }>("/providers/ELIT/payments"),
  paymentOptions: () =>
    api.get<{
      banks: { id?: number; name: string }[];
      operations: { bank?: number; code?: string; name?: string; validations?: unknown }[];
    }>("/providers/ELIT/payments/options"),
  createOperation: (body: {
    type?: string;
    bank?: number;
    bankName?: string;
    operationName?: string;
    date?: string;
    amount?: number;
    number?: string;
  }) => api.post<unknown>("/providers/ELIT/payments/operation", body),
  finishPayment: () => api.post<unknown>("/providers/ELIT/payments/finish"),
};

export interface ElitSaleNote {
  orderNumber: string;
  invoiceNumber: string;
  status: string;
  statusDescription?: string;
  date: string;
  amount: number | null;
  currency: string;
  form?: string;
  warehouseName?: string;
  saleCondition?: string;
  shippingMethod?: string;
  pdfUrl?: string;
  dispatchNotePdfUrl?: string;
  tracking?: string;
  trackingSupplier?: string;
  trackingStatus?: string;
  items?: {
    code?: string;
    name?: string;
    quantity?: number | null;
    price?: number | null;
    net?: number | null;
    vat?: number | null;
    internalTax?: number | null;
    perceptions?: number | null;
    total?: number | null;
    kit?: boolean;
    children?: {
      code?: string;
      name?: string;
      quantity?: number | null;
      price?: number | null;
      total?: number | null;
    }[];
  }[];
  summary?: {
    subtotal?: number | null;
    net?: number | null;
    vat?: number | null;
    internalTaxes?: number | null;
    perceptions?: number | null;
    total?: number | null;
    shipping?: number | null;
  };
}

export interface ElitMovement {
  date: string;
  dueDate?: string;
  form: string;
  number: string;
  remito?: string;
  debit: number | null;
  credit: number | null;
  amount?: number | null;
  total: number | null;
  balance: number | null;
  balanceUsd: number | null;
  currency: string;
  exchangeRate?: number | null;
  status?: string;
}

export interface ElitCtaSummary {
  status: string;
  approved: boolean;
  creditLimit: number | null;
  currentAccount: number | null;
  checks: number | null;
  pendingOrders: number | null;
  availableCredit: number | null;
}

export interface ElitUsdVoucher {
  date: string;
  dueDate?: string;
  form: string;
  number: string;
  debit: number | null;
  credit: number | null;
  status?: string;
}

export interface ElitPayment {
  id: string;
  date: string;
  total: number | null;
  totalApproved: number | null;
  status: string;
}

export type ElitCheckoutPayload = {
  items: { code: string; qty: number; name?: string }[];
  warehouse?: number;
  shippingMethod?: number;
  saleCondition?: number;
  shippingAddress?: string;
};

export const elitCheckoutApi = {
  preview: (body: ElitCheckoutPayload) =>
    api.post<ElitCheckoutPreview>("/providers/ELIT/checkout/preview", body),
  draft: (body: ElitCheckoutPayload & { warehouse: number; background?: boolean }) =>
    api.post<ElitDraftResult>("/providers/ELIT/checkout/draft", body, {
      timeout: body.background ? 30_000 : 180_000,
    }),
  drafts: () => api.get<NodoProviderDraft[]>("/providers/ELIT/drafts"),
  draftById: (id: string) => api.get<NodoProviderDraft>(`/providers/ELIT/drafts/${id}`),
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
  byCategory: (category: string, take = 60, opts: { includeOutOfStock?: boolean } = {}) =>
    api.get<ProductDTO[]>("/catalog/by-category", {
      params: {
        category,
        take,
        ...(opts.includeOutOfStock ? { includeOutOfStock: true } : {}),
      },
    }),
  providerDisplay: () => api.get<ProviderDisplay[]>("/catalog/provider-display"),
};

// --- Referencias de precio de venta (locales) ---
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

export interface RetailSearchResponse {
  query: string;
  tokens: string[];
  results: RetailSearchHit[];
  totalMatched?: number;
}

export const retailApi = {
  search: (q: string, take = 60) =>
    api.get<RetailSearchResponse>("/retail/search", { params: { q, take } }),
  getProduct: (id: string) => api.get<RetailProductDetail>(`/retail/products/${id}`),
  triggerIngest: () =>
    api.post<{ started: boolean; reason?: string }>("/admin/retail/ingest"),
  repairPrices: () =>
    api.post<{ storesRepaired: number; productsScaled: number }>("/admin/retail/repair-prices"),
  triggerStoreIngest: (storeId: string) =>
    api.post<{ started: boolean; reason?: string; productsUpserted?: number }>(
      `/admin/retail/stores/${storeId}/ingest`
    ),
  ingestStatus: () =>
    api.get<{
      running: boolean;
      mode: "full" | "batch" | null;
      stores: number;
      products: number;
      lastRun: {
        id: string;
        status: string;
        mode: string;
        startedAt: string;
        finishedAt: string | null;
        storesTotal: number;
        storesDone: number;
        productsUpserted: number;
        currentStoreName: string | null;
        heartbeatAt: string;
        errorMessage: string | null;
      } | null;
    }>("/admin/retail/ingest/status"),
  listStores: () =>
    api.get<
      {
        id: string;
        externalId: number;
        name: string;
        logoUrl: string | null;
        priceDivisor: number;
        syncedAt: string;
        productCount: number;
        neverSynced: boolean;
      }[]
    >("/admin/retail/stores"),
  listStoreProducts: (storeId: string, opts?: { q?: string; page?: number; take?: number }) =>
    api.get<{
      store: {
        id: string;
        name: string;
        logoUrl: string | null;
        priceDivisor: number;
        syncedAt: string;
      };
      page: number;
      take: number;
      total: number;
      products: {
        id: string;
        externalId: number;
        name: string;
        price: number;
        categoryName: string | null;
        imageUrl: string | null;
        productUrl: string | null;
        syncedAt: string;
      }[];
    }>(`/admin/retail/stores/${storeId}/products`, { params: opts }),
};

// --- Permisos por módulo del usuario actual ---
export type ModuleKey = "search" | "cart" | "credentials" | "providers" | "brands" | "diagnostics" | "admin";

export const permissionsApi = {
  mine: () => api.get<ModuleKey[]>("/me/permissions"),
};

// --- Banners (home / buscador) ---
export type BannerSlot =
  | "hero_main" | "hero_side" | "tile_1" | "tile_2" | "tile_3" | "tile_4" | "strip";

export interface Banner {
  id: string;
  position: "home" | "search";
  slot?: BannerSlot | null;
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

export type BrandPreset = "violet" | "gamer_red" | "ocean" | "emerald";

export interface PlatformSettings {
  id: string;
  brandPreset: BrandPreset;
}

export const platformApi = {
  settings: () => api.get<PlatformSettings>("/platform/settings"),
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
  updatedAt?: string;
  brandId?: string | null;
  brand?: { id: string; name: string; slug: string } | null;
  providers?: string[];
  brandAccesses?: { brandId: string; brandName: string; brandSlug: string; status: string }[];
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

/** Sesión de otro usuario emitida para el superadmin. */
export interface ImpersonationSession {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    active: boolean;
    brandId?: string;
  };
}

export const adminApi = {
  listUsers: () => api.get<AdminUser[]>("/admin/users"),
  // Omitir `password` hace que la plataforma genere una y la devuelva en
  // `generatedPassword`. Es la única vez que puede leerse.
  createUser: (data: {
    username: string;
    email: string;
    password?: string;
    role: UserRole;
    brandId?: string;
    active?: boolean;
    endDate?: string;
  }) => api.post<AdminUser & { generatedPassword?: string }>("/admin/users", data),
  updateUser: (userId: string, data: { username?: string; email?: string; brandId?: string | null }) =>
    api.put<{ id: string; username: string; email: string; role: UserRole; brandId: string | null }>(`/admin/users/${userId}`, data),
  resetPassword: (userId: string, password?: string) =>
    api.put<{ id: string; generatedPassword?: string }>(`/admin/users/${userId}/password`, { password }),
  impersonate: (userId: string) =>
    api.post<ImpersonationSession>(`/admin/users/${userId}/impersonate`, {}),
  updateRole: (userId: string, role: UserRole) =>
    api.put<{ id: string; role: UserRole }>(`/admin/users/${userId}/role`, { role }),
  updateActiveStatus: (userId: string, active: boolean) =>
    api.put(`/admin/users/${userId}/active-status`, { active }),
  updateEndDate: (userId: string, endDate: string | null) =>
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

  getPlatformSettings: () => api.get<PlatformSettings>("/admin/platform/settings"),
  updatePlatformSettings: (brandPreset: BrandPreset) =>
    api.put<PlatformSettings>("/admin/platform/settings", { brandPreset }),
};

export type CatalogAliasKind = "BRAND" | "CATEGORY" | "SUBCATEGORY";
export type CatalogMatchKind = "EAN" | "PART_NUMBER";

export interface CatalogEnrichmentOverview {
  termCount: number;
  aliasCount: number;
  overrideCount: number;
  productCount: number;
  incompleteCount: number;
  aiConfigured: boolean;
}

export interface CatalogRawValueStat {
  kind: CatalogAliasKind;
  provider: string | null;
  rawKey: string;
  count: number;
  sampleNames: string[];
  looksLikeCode: boolean;
}

export interface CatalogBoardRow {
  id: string;
  provider: string;
  rawKey: string;
  count: number;
  sampleNames: string[];
  looksLikeCode: boolean;
  termId: string | null;
  termLabel: string | null;
  visible: boolean;
  parentId: string | null;
  parentLabel: string | null;
  linked: { provider: string; rawKey: string; count: number }[];
}

export interface CatalogTermCard {
  id: string;
  label: string;
  kind: CatalogAliasKind;
  visible: boolean;
  inMenu?: boolean;
  parentId: string | null;
  parentLabel: string | null;
  members: { provider: string; rawKey: string; count: number }[];
  productCount: number;
}

export interface CatalogBoard {
  kind: CatalogAliasKind;
  rows: CatalogBoardRow[];
  terms: CatalogTermCard[];
  stats: {
    rawCount: number;
    linkedCount: number;
    termCount: number;
    groupCount?: number;
    hiddenCount: number;
  };
}

export interface CatalogTerm {
  id: string;
  kind: CatalogAliasKind;
  label: string;
  parentId: string | null;
  visible: boolean;
  inMenu?: boolean;
  parent?: { id: string; label: string; kind: CatalogAliasKind } | null;
  children?: { id: string; label: string; kind: CatalogAliasKind }[];
  _count?: { aliases: number };
}

export interface CatalogIncompleteProduct {
  provider: string;
  externalId: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  displayBrand: string | null;
  displayCategory: string | null;
  displaySubcategory: string | null;
  missingBrand: boolean;
  missingCategory: boolean;
  missingSubcategory: boolean;
  sku: string | null;
  partNumber: string | null;
  ean: string | null;
}

export interface CatalogPreviewProduct {
  provider: string;
  externalId: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  sku: string | null;
  partNumber: string | null;
}

export interface CatalogMergeCluster {
  label: string;
  confidence?: string;
  reason?: string;
  members: { provider: string; rawKey: string; count: number }[];
}

export const catalogEnrichmentApi = {
  overview: () => api.get<CatalogEnrichmentOverview>("/admin/catalog-enrichment/overview"),
  board: (kind: CatalogAliasKind) =>
    api.get<CatalogBoard>("/admin/catalog-enrichment/board", { params: { kind } }),
  terms: (kind?: CatalogAliasKind) =>
    api.get<CatalogTerm[]>("/admin/catalog-enrichment/terms", { params: kind ? { kind } : {} }),
  createTerm: (data: {
    kind: CatalogAliasKind;
    label: string;
    parentId?: string | null;
    visible?: boolean;
    inMenu?: boolean;
  }) => api.post<CatalogTerm>("/admin/catalog-enrichment/terms", data),
  updateTerm: (
    id: string,
    data: { label?: string; parentId?: string | null; visible?: boolean; inMenu?: boolean }
  ) => api.patch<CatalogTerm>(`/admin/catalog-enrichment/terms/${id}`, data),
  deleteTerm: (id: string, force?: boolean) =>
    api.delete(`/admin/catalog-enrichment/terms/${id}`, { params: force ? { force: "1" } : {} }),
  link: (data: {
    kind: CatalogAliasKind;
    items: { provider: string; rawKey: string }[];
    label?: string;
    termId?: string;
    source?: "MANUAL" | "AUTO" | "AI";
  }) =>
    api.post<{ term: { id: string; label: string }; items: { provider: string; rawKey: string }[] }>(
      "/admin/catalog-enrichment/link",
      data
    ),
  move: (data: {
    kind: CatalogAliasKind;
    from: { provider: string; rawKey: string };
    toTermId?: string;
    toLabel?: string;
    deleteEmptySourceTerm?: boolean;
  }) => api.post<{ moved: number }>("/admin/catalog-enrichment/move", data),
  visibility: (data: {
    kind: CatalogAliasKind;
    provider: string;
    rawKey: string;
    visible: boolean;
  }) => api.post("/admin/catalog-enrichment/visibility", data),
  incomplete: (params?: { limit?: number; offset?: number; q?: string }) =>
    api.get<{ items: CatalogIncompleteProduct[]; total: number; limit: number; offset: number }>(
      "/admin/catalog-enrichment/incomplete",
      { params }
    ),
  assignProduct: (data: {
    provider: string;
    externalId: string;
    displayBrand?: string | null;
    displayCategory?: string | null;
    displaySubcategory?: string | null;
    source?: "MANUAL" | "AUTO" | "AI";
  }) => api.post("/admin/catalog-enrichment/products/assign", data),
  preview: (params: {
    kind: CatalogAliasKind;
    rawKey?: string;
    termId?: string;
    provider?: string;
    limit?: number;
  }) => api.get<CatalogPreviewProduct[]>("/admin/catalog-enrichment/preview", { params }),
  aiSuggestMerges: (kind: CatalogAliasKind, opts?: { excludeKeys?: string[]; offset?: number }) =>
    api.post<{
      clusters: CatalogMergeCluster[];
      usedAi: boolean;
      kind: CatalogAliasKind;
      total: number;
      offset: number;
      hasMore: boolean;
      unlinkedCount: number;
    }>("/admin/catalog-enrichment/ai/suggest-merges", { excludeKeys: opts?.excludeKeys ?? [] }, {
      params: { kind, offset: opts?.offset ?? 0 },
    }),
  aiProductHint: (provider: string, externalId: string) =>
    api.get<{
      displayBrand: string | null;
      displayCategory: string | null;
      displaySubcategory: string | null;
      reasoning: string;
      source: string;
    }>("/admin/catalog-enrichment/ai/product-hint", { params: { provider, externalId } }),
  saveOpenAi: (apiKey: string) =>
    api.put<{ hasOpenAiKey: boolean }>("/admin/catalog-enrichment/openai", { apiKey }),
  clearOpenAi: () => api.delete<{ hasOpenAiKey: boolean }>("/admin/catalog-enrichment/openai"),
};

/** Marca/categoría visible con fallback al valor crudo del proveedor. */
export function productDisplayBrand(p: Pick<ProductDTO, "displayBrand" | "brand">) {
  return p.displayBrand ?? p.brand ?? null;
}

export function productDisplayCategory(p: Pick<ProductDTO, "displayCategory" | "category">) {
  return p.displayCategory ?? p.category ?? null;
}

export function productDisplaySubcategory(p: Pick<ProductDTO, "displaySubcategory" | "subcategory">) {
  return p.displaySubcategory ?? p.subcategory ?? null;
}

export interface ImageSyncRun {
  id: string;
  status: "RUNNING" | "OK" | "ERROR" | "CANCELLED" | string;
  kind: string;
  source: "manual" | "cron" | string;
  provider: string | null;
  batchSize: number;
  once: boolean;
  maxItems: number | null;
  missingTotal: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  lastQuery: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  heartbeatAt: string;
}

export interface ImageSyncStatus {
  hasSerperKey: boolean;
  cronEnabled: boolean;
  cronHourHint: string;
  cronLimit: number;
  missing: number;
  pending: number;
  pendingVisible: number;
  pendingDeferred: number;
  filled: number;
  running: boolean;
  byProvider: { provider: string; missing: number; total: number }[];
  lastRun: ImageSyncRun | null;
}

export interface ImageSyncMissingItem {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  brand: string | null;
  sku: string | null;
  ean: string | null;
  partNumber: string | null;
  query: string;
  inCatalog: boolean;
}

export interface ImageSyncFill {
  id: string;
  runId: string | null;
  productId: string;
  provider: string;
  externalId: string;
  name: string;
  brand: string | null;
  query: string;
  imageUrl: string | null;
  source: string;
  status: "filled" | "skipped" | "failed" | string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SerperImageHit {
  imageUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  source: string | null;
}

export const imageSyncApi = {
  status: () => api.get<ImageSyncStatus>("/admin/images/status"),
  missing: (params?: { take?: number; provider?: string }) =>
    api.get<{ items: ImageSyncMissingItem[] }>("/admin/images/missing", { params }),
  history: (params?: { page?: number; take?: number; status?: string; provider?: string; q?: string }) =>
    api.get<{ total: number; page: number; take: number; items: ImageSyncFill[] }>("/admin/images/history", { params }),
  saveSerper: (apiKey: string) => api.put<{ hasSerperKey: boolean }>("/admin/images/serper", { apiKey }),
  clearSerper: () => api.delete<{ hasSerperKey: boolean }>("/admin/images/serper"),
  setCron: (enabled: boolean) => api.put<{ cronEnabled: boolean }>("/admin/images/cron", { enabled }),
  firstPhoto: (data?: { provider?: string; batchSize?: number; once?: boolean }) =>
    api.post<{ started: boolean; reason?: string }>("/admin/images/first-photo", data ?? {}),
  stop: () => api.post<{ stopped: boolean }>("/admin/images/first-photo/stop", {}),
  serperSearch: (productId: string, query?: string) =>
    api.post<{ query: string; images: SerperImageHit[] }>(
      `/admin/images/products/${productId}/serper-search`,
      query ? { query } : {}
    ),
  setImage: (productId: string, imageUrl: string, source: "serper_pick" | "upload" | "serper" = "serper_pick") =>
    api.put<ImageSyncFill>(`/admin/images/products/${productId}/image`, { imageUrl, source }),
};

// --- Organizaciones (multi-tenant) ---
// Ver docs/ARQUITECTURA_TENANTS.md. `tenantRole` es el alcance dentro de la
// organización; `platformRole` es el nivel de acceso a Nodo.

export type TenantType = "RETAILER" | "DISTRIBUTOR" | "BRAND";

export type TenantRole =
  | "OWNER"
  | "ADMIN"
  | "BUYER"
  | "SELLER"
  | "PRODUCT_MANAGER"
  | "MARKETING"
  | "COMMERCIAL"
  | "VIEWER";

export type TenantLinkStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";

export const TENANT_TYPE_LABELS: Record<TenantType, string> = {
  RETAILER: "Comercio",
  DISTRIBUTOR: "Distribuidor",
  BRAND: "Marca",
};

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  BUYER: "Comprador",
  SELLER: "Vendedor",
  PRODUCT_MANAGER: "Product Manager",
  MARKETING: "Marketing",
  COMMERCIAL: "Comercial",
  VIEWER: "Solo lectura",
};

export const TENANT_ROLES_BY_TYPE: Record<TenantType, TenantRole[]> = {
  RETAILER: ["OWNER", "ADMIN", "BUYER", "SELLER", "VIEWER"],
  DISTRIBUTOR: ["OWNER", "ADMIN", "SELLER", "PRODUCT_MANAGER", "VIEWER"],
  BRAND: ["OWNER", "ADMIN", "MARKETING", "COMMERCIAL", "VIEWER"],
};

/** Roles que pueden vaciar el catálogo de la organización. */
export const TENANT_ROLES_CAN_PURGE_CATALOG: TenantRole[] = ["OWNER", "ADMIN"];

export const TENANT_ROLES_CAN_MANAGE_TEAM: TenantRole[] = ["OWNER", "ADMIN"];

export const TENANT_LINK_STATUS_LABELS: Record<TenantLinkStatus, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
  REVOKED: "Revocado",
};

export interface TenantMember {
  membershipId: string;
  tenantRole: TenantRole;
  title: string | null;
  membershipActive: boolean;
  userId: string;
  username: string;
  email: string;
  platformRole: UserRole;
  active: boolean;
  endDate: string | null;
  managedBrands?: string[];
}

export interface TenantAccessCode {
  id: string;
  code: string;
  label: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

export interface TenantLinkView {
  linkId: string;
  status: TenantLinkStatus;
  discountPercent: string | number | null;
  notes: string | null;
  accountManager: { id: string; username: string; email: string } | null;
  tenant: { id: string; name: string; type: TenantType } | undefined;
}

export interface TenantNode {
  id: string;
  name: string;
  type: TenantType;
  providerKey: Provider | null;
  brand: { id: string; name: string } | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  advertisingEnabled: boolean;
  active: boolean;
  createdAt: string;
  members: TenantMember[];
  accessCodes: TenantAccessCode[];
  suppliers: TenantLinkView[];
  clients: TenantLinkView[];
}

export interface TenantTree {
  tenants: TenantNode[];
  unassignedUsers: Pick<AdminUser, "id" | "username" | "email" | "role" | "active" | "endDate">[];
}

export interface TenantUserRelations {
  organizations: {
    membershipId: string;
    role: TenantRole;
    title: string | null;
    active: boolean;
    tenant: { id: string; name: string; type: TenantType };
    colleagues: TenantMember[];
    suppliers: TenantLinkView[];
    clients: TenantLinkView[];
  }[];
  assignedAccounts: {
    linkId: string;
    status: TenantLinkStatus;
    discountPercent: string | number | null;
    client: { id: string; name: string; type: TenantType };
    supplier: { id: string; name: string; type: TenantType };
  }[];
}

export const tenantsApi = {
  tree: () => api.get<TenantTree>("/admin/tenants"),
  userRelations: (userId: string) => api.get<TenantUserRelations>(`/admin/tenants/users/${userId}/relations`),

  create: (data: {
    name: string;
    type: TenantType;
    providerKey?: Provider;
    brandId?: string;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
    advertisingEnabled?: boolean;
  }) => api.post<TenantNode>("/admin/tenants", data),
  update: (
    id: string,
    data: Partial<{
      name: string;
      providerKey: Provider | null;
      brandId: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
      notes: string | null;
      advertisingEnabled: boolean;
      active: boolean;
    }>
  ) => api.put<TenantNode>(`/admin/tenants/${id}`, data),
  remove: (id: string) => api.delete(`/admin/tenants/${id}`),

  addMember: (tenantId: string, data: { userId: string; role: TenantRole; title?: string }) =>
    api.post<TenantMember>(`/admin/tenants/${tenantId}/members`, data),
  createMemberUser: (
    tenantId: string,
    data: { username: string; email: string; password: string; role: TenantRole; title?: string }
  ) => api.post<TenantMember>(`/admin/tenants/${tenantId}/members/new-user`, data),
  updateMember: (membershipId: string, data: Partial<{ role: TenantRole; title: string | null; active: boolean }>) =>
    api.put<TenantMember>(`/admin/tenants/members/${membershipId}`, data),
  removeMember: (membershipId: string) => api.delete(`/admin/tenants/members/${membershipId}`),
  setManagedBrands: (membershipId: string, brandNames: string[]) =>
    api.put(`/admin/tenants/members/${membershipId}/managed-brands`, { brandNames }),

  upsertLink: (data: {
    clientTenantId: string;
    supplierTenantId: string;
    accountManagerId?: string | null;
    status?: TenantLinkStatus;
    discountPercent?: number | null;
    notes?: string | null;
  }) => api.put("/admin/tenants/links", data),
  deleteLink: (linkId: string) => api.delete(`/admin/tenants/links/${linkId}`),

  createAccessCode: (tenantId: string, data: { label?: string; maxUses?: number; expiresInDays?: number }) =>
    api.post<TenantAccessCode>(`/admin/tenants/${tenantId}/access-codes`, data),
  revokeAccessCode: (codeId: string) => api.delete(`/admin/tenants/access-codes/${codeId}`),
};

export type BrandActionKind = "PURCHASE_QTY" | "PURCHASE_AMOUNT" | "REBATE";
export type BrandActionStatus = "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
export type BrandActionRewardKind = "NONE" | "FLAT" | "PER_UNIT";
export type BrandActionScopeKind = "DISTRIBUTOR" | "RETAILER" | "PRODUCT";
export type OrgNotificationKind = "BRAND_ACTION" | "BRAND_LANDING" | "DISTRIBUTOR_NOTE" | "SYSTEM";

export interface BrandActionProgress {
  current: number;
  target: number | null;
  ratio: number;
  met: boolean;
}

export interface BrandActionScope {
  kind: BrandActionScopeKind;
  refId: string;
}

export interface BrandAction {
  id: string;
  kind: BrandActionKind;
  status: BrandActionStatus;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  targetQty: number | null;
  targetAmountUsd: number | null;
  rewardKind: BrandActionRewardKind;
  rewardUsd: number | null;
  notifyRetailers: boolean;
  scopes: BrandActionScope[];
  progress: BrandActionProgress;
}

export type UpsertBrandAction = Omit<BrandAction, "id" | "progress" | "status"> & {
  status?: BrandActionStatus;
};

export interface BrandLanding {
  name: string;
  publicKey: string;
  publicPath: string;
  published: boolean;
  headline: string | null;
  about: string | null;
  logoUrl: string | null;
  heroUrl: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  blocks: { type?: string; title?: string; body?: string; url?: string }[] | unknown;
  html: string | null;
  primaryColor: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  fontFamily: string | null;
}

export interface PublicBrandLanding {
  publicKey: string;
  name: string;
  headline: string | null;
  about: string | null;
  logoUrl: string | null;
  heroUrl: string | null;
  websiteUrl: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  blocks: { type?: string; title?: string; body?: string; url?: string }[] | unknown;
  htmlDocument?: string;
}

export type BrandSignalLight = "GREEN" | "YELLOW" | "RED" | "BLUE" | "GRAY";

export interface BrandSkuSignal {
  id: string;
  provider: string;
  providerName: string;
  externalId: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  light: BrandSignalLight;
  suggestedPrice: number | null;
  qtyEstimate: number | null;
  incomingAt: string | null;
  notes: string | null;
}

export interface BrandCatalogProduct {
  provider: string;
  providerName: string;
  externalId: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  selected: boolean;
}

export interface BrandResource {
  id: string;
  kind: "MATERIAL" | "TRAINING";
  type: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  contentUrl: string | null;
  createdAt: string;
}

export interface BrandModuleState {
  ready: boolean;
  count: number;
}

export type BrandModuleId = "space" | "products" | "actions" | "materials" | "trainings" | "contact";

export interface BrandPresence {
  pending: boolean;
  readyCount: number;
  total: number;
  modules: Record<BrandModuleId, BrandModuleState>;
}

export interface BrandHubHtmlPart {
  type: "html" | "slot";
  html?: string;
  name?: string;
}

export interface BrandHub {
  linkId: string;
  tenantId: string;
  name: string;
  status: TenantLinkStatus;
  connectedAt: string;
  presence: BrandPresence;
  theme: {
    primaryColor: string | null;
    backgroundColor: string | null;
    textColor: string | null;
    fontFamily: string | null;
    logoUrl: string | null;
    heroUrl: string | null;
    headline: string | null;
    about: string | null;
  };
  contact: {
    websiteUrl: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
  };
  htmlDocument: string;
  htmlSlots: string[];
  htmlParts: BrandHubHtmlPart[];
  actions: BrandAction[];
  signals: BrandSkuSignal[];
  materials: BrandResource[];
  trainings: BrandResource[];
}

export interface BrandAccounts {
  retailers: { linkId: string; tenantId: string; name: string; status: TenantLinkStatus }[];
  linkedDistributors: { linkId: string; tenantId: string; name: string; status: TenantLinkStatus }[];
  distributors: { id: string; name: string; providerKey: string | null }[];
}

export interface RetailerBrandView {
  linkId: string;
  tenantId: string;
  name: string;
  status: TenantLinkStatus;
  connectedAt: string;
  landing: {
    publicKey: string;
    published: boolean;
    headline: string | null;
    about: string | null;
    logoUrl: string | null;
    primaryColor?: string | null;
  } | null;
  signalCount: number;
  unreadNotices: number;
  presence: BrandPresence;
  actions: BrandAction[];
}

export interface OrgNotice {
  id: string;
  kind: OrgNotificationKind;
  title: string;
  body: string;
  actionId: string | null;
  landingKey: string | null;
  readAt: string | null;
  createdAt: string;
  fromTenant: { id: string; name: string; type: TenantType } | null;
}

export const brandApi = {
  landing: () => api.get<BrandLanding>("/my/brand/landing"),
  saveLanding: (data: Partial<BrandLanding>) => api.put<BrandLanding>("/my/brand/landing", data),
  catalog: (params?: { q?: string; provider?: string; take?: number }) =>
    api.get<{ canWrite: boolean; products: BrandCatalogProduct[] }>("/my/brand/catalog", { params }),
  signals: () => api.get<{ canWrite: boolean; signals: BrandSkuSignal[] }>("/my/brand/signals"),
  upsertSignal: (data: {
    provider: string;
    externalId: string;
    light?: BrandSignalLight;
    suggestedPrice?: number | null;
    qtyEstimate?: number | null;
    incomingAt?: string | null;
    notes?: string | null;
  }) => api.put<BrandSkuSignal>("/my/brand/signals", data),
  removeSignal: (id: string) => api.delete<{ ok: true }>(`/my/brand/signals/${id}`),
  importSignals: (csv: string) => api.post<{ upserted: number; skipped: number }>("/my/brand/signals/import", { csv }),
  resources: (kind?: "MATERIAL" | "TRAINING") =>
    api.get<{ canWrite: boolean; resources: BrandResource[] }>("/my/brand/resources", { params: { kind } }),
  createResource: (data: {
    kind: "MATERIAL" | "TRAINING";
    type: string;
    title: string;
    description?: string | null;
    fileUrl?: string | null;
    contentUrl?: string | null;
  }) => api.post<BrandResource>("/my/brand/resources", data),
  removeResource: (id: string) => api.delete<{ ok: true }>(`/my/brand/resources/${id}`),
  actions: () => api.get<{ canWrite: boolean; actions: BrandAction[] }>("/my/brand/actions"),
  createAction: (data: UpsertBrandAction) => api.post<BrandAction>("/my/brand/actions", data),
  updateAction: (id: string, data: UpsertBrandAction) => api.put<BrandAction>(`/my/brand/actions/${id}`, data),
  setActionStatus: (id: string, status: Exclude<BrandActionStatus, "DRAFT">) =>
    api.post<BrandAction>(`/my/brand/actions/${id}/status`, { status }),
  accounts: () => api.get<BrandAccounts>("/my/brand/accounts"),
  note: (data: { retailerTenantId: string; title: string; body: string }) =>
    api.post<{ ok: true }>("/my/brand/notes", data),
  linked: () => api.get<{ brands: RetailerBrandView[] }>("/my/brands"),
  hub: (linkId: string) => api.get<BrandHub>(`/my/brands/${linkId}`),
  notifications: () => api.get<OrgNotice[]>("/my/notifications"),
  markRead: (id: string) => api.post<{ ok: true }>(`/my/notifications/${id}/read`),
  sendNotice: (data: { retailerTenantId: string; title: string; body: string }) =>
    api.post<{ ok: true }>("/my/notifications/send", data),
};

export const publicBrandApi = {
  get: (publicKey: string) => api.get<PublicBrandLanding>(`/public/brands/${publicKey}`),
};

export const adminBrandOrgsApi = {
  sync: () => api.post<{ terms: number; created: number; linked: number; users: number }>("/admin/brands/sync"),
};

export default api;
