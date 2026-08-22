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
api.interceptors.response.use(
  (response) => {
    const body = response.data as unknown;
    if (body && typeof body === "object" && "success" in (body as Record<string, unknown>)) {
      response.data = (body as { data: unknown }).data;
    }
    return response;
  },
  (error) => {
    // Sesión vencida o inválida: en vez de dejar cada pantalla mostrando
    // "vacío" en silencio (confunde mucho — parece que se borró todo),
    // se limpia la sesión y se manda a login una sola vez. Importante: hay
    // que borrar también la cookie "tgs_auth" (no solo localStorage) — el
    // middleware decide con esa cookie si mandarte a "/" o a "/login", y si
    // queda viva mientras el token del cliente ya no sirve, arma un rebote
    // infinito entre las dos rutas.
    if (typeof window !== "undefined" && error?.response?.status === 401 && window.location.pathname !== "/login") {
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
  orders: () =>
    api.get<{ orders: InvidOrder[]; paymentUploads?: InvidFileForm[]; note?: string }>("/providers/INVID/orders"),
  accountStatement: () =>
    api.get<{ balance: number | null; movements: InvidAccountMovement[] }>("/providers/INVID/account-statement"),
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
  total: number;
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
  total: string | number | null;
  createdAt: string;
  errorMessage: string | null;
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
  }) => api.post<InvidDraftResult>("/providers/INVID/checkout/draft", body),
  drafts: () => api.get<InvidNodoDraft[]>("/providers/INVID/drafts"),
};

// --- NewBytes: pedidos, comprobantes y checkout (API oficial api.nb.com.ar) ---
export interface NewBytesOrder {
  orderNumber?: string;
  webOrderNumber?: string;
  albNumber?: string;
  branch?: string;
  status: string;
  statusDescription?: string;
  date: string;
  amount?: string | number;
  clientName?: string;
  trackingNumber?: string;
  invoice?: string;
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
  total: string | number | null;
  createdAt: string;
  errorMessage: string | null;
  items?: {
    code?: string;
    name?: string;
    qty?: number;
    quantity?: number;
    price?: number;
    priceUsd?: number;
    subtotal?: number;
    total?: number;
  }[];
}

export const newBytesAccountApi = {
  orders: () => api.get<{ orders: NewBytesOrder[] }>("/providers/NEW_BYTES/orders"),
  purchaseOrders: () => api.get<{ orders: NewBytesOrder[] }>("/providers/NEW_BYTES/purchase-orders"),
  accountStatement: () =>
    api.get<{ balance: number | null; movements: NewBytesComprobante[] }>("/providers/NEW_BYTES/account-statement"),
  orderDetail: (id: string) =>
    api.get<{ found: boolean; raw: unknown }>(`/providers/NEW_BYTES/orders/${encodeURIComponent(id)}`),
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
    api.post<NewBytesDraftResult>("/providers/NEW_BYTES/checkout/draft", body),
  drafts: () => api.get<NewBytesNodoDraft[]>("/providers/NEW_BYTES/drafts"),
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
  }) => api.post<GnDraftResult>("/providers/GRUPO_NUCLEO/checkout/draft", body),
  drafts: () => api.get<NodoProviderDraft[]>("/providers/GRUPO_NUCLEO/drafts"),
};

export interface AirCheckoutPreview {
  nrocompro: string;
  items: { code: string; qty: number; name: string; price: number; subtotal: number }[];
  subtotal: number;
  total: number;
  iva21: number;
  iva105: number;
  ii: number;
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
  account: () =>
    api.get<{
      balance: number | null;
      movements: Record<string, string>[];
      invoices: Record<string, string>[];
      pending: Record<string, string>[];
      drafts: NodoProviderDraft[];
      note: string;
    }>("/providers/AIR/account"),
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
  }) => api.post<AirDraftResult>("/providers/AIR/checkout/draft", body),
  drafts: () => api.get<NodoProviderDraft[]>("/providers/AIR/drafts"),
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
  account: () =>
    api.get<{
      profile: { id?: string; name?: string; exchange?: number | null };
      balance: number | null;
      orders: ElitSaleNote[];
      movements: ElitMovement[];
      payments?: ElitPayment[];
      canCreateReport?: boolean;
      drafts: NodoProviderDraft[];
      note: string;
    }>("/providers/ELIT/account"),
  saleNote: (number: string) => api.get<ElitSaleNote>(`/providers/ELIT/salenotes/${encodeURIComponent(number)}`),
  payments: () =>
    api.get<{ canCreateReport: boolean; active: unknown; payments: ElitPayment[] }>("/providers/ELIT/payments"),
  paymentOptions: () =>
    api.get<{
      banks: { id?: number; name: string }[];
      operations: { bank?: number; code?: string; name?: string }[];
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
    total?: number | null;
  }[];
  summary?: {
    subtotal?: number | null;
    vat?: number | null;
    total?: number | null;
    shipping?: number | null;
  };
}

export interface ElitMovement {
  date: string;
  form: string;
  number: string;
  debit: number | null;
  credit: number | null;
  total: number | null;
  balance: number | null;
  balanceUsd: number | null;
  currency: string;
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
  draft: (body: ElitCheckoutPayload & { warehouse: number }) =>
    api.post<ElitDraftResult>("/providers/ELIT/checkout/draft", body),
  drafts: () => api.get<NodoProviderDraft[]>("/providers/ELIT/drafts"),
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
