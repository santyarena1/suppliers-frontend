import type {
  AdminBrandInput,
  AdminDistributorInput,
  AvailabilityFilters,
  AvailabilityInput,
  BrandAccount,
  BrandNewsInput,
  BrandProductInput,
  BrandProfileInput,
  InviteUserInput,
  NewsFilters,
  ProductFilters,
} from "../types";
import {
  MOCK_ADMIN_METRICS,
  MOCK_AUDIT,
  MOCK_BRAND_DISTRIBUTORS,
  MOCK_BRAND_GIGABYTE_ID,
  MOCK_BRAND_MSI_ID,
  MOCK_BRANDS,
  MOCK_DASHBOARD_STATS,
  MOCK_DISTRIBUTORS,
  MOCK_USER_DASHBOARD,
  mockImportPreview,
  mockPaginated,
} from "./data";
import { mockStore } from "./store";

function filterProducts(products: typeof mockStore.products, filters?: ProductFilters) {
  let list = [...products];
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (p) =>
        p.commercialName.toLowerCase().includes(q) ||
        p.brandSku.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q)
    );
  }
  if (filters?.discontinued != null) list = list.filter((p) => p.discontinued === filters.discontinued);
  if (filters?.recommended != null) list = list.filter((p) => p.recommended === filters.recommended);
  if (filters?.active != null) list = list.filter((p) => p.active === filters.active);
  return list;
}

function filterAvailability(brandId: string, filters?: AvailabilityFilters) {
  const products = mockStore.products.filter((p) => p.brandId === brandId);
  let matrix = mockStore.availability.filter((a) => products.some((p) => p.id === a.productId));
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    const ids = products.filter((p) => p.commercialName.toLowerCase().includes(q) || p.brandSku.toLowerCase().includes(q)).map((p) => p.id);
    matrix = matrix.filter((a) => ids.includes(a.productId));
  }
  if (filters?.distributorId) matrix = matrix.filter((a) => a.distributorId === filters.distributorId);
  if (filters?.status) matrix = matrix.filter((a) => a.status === filters.status);
  const productIds = new Set(matrix.map((m) => m.productId));
  return {
    products: products.filter((p) => productIds.has(p.id)),
    matrix,
  };
}

function mockBlob(content: string, type = "text/csv") {
  return { data: new Blob([content], { type }) };
}

/** APIs mock — solo usadas por _dev-fallback cuando el backend no responde */
export const mockUserBrandsApi = {
  dashboard: async () => ({
    ...MOCK_USER_DASHBOARD,
    authorizedBrands: mockStore.accesses.filter((a) => a.status === "ACTIVE"),
    recentAlerts: mockStore.notifications.filter((n) => !n.read),
    unreadNotifications: mockStore.notifications.filter((n) => !n.read).length,
  }),

  authorized: async () => mockStore.accesses.filter((a) => a.status === "ACTIVE"),

  getBrand: async (brandId: string) => {
    const b = MOCK_BRANDS.find((x) => x.id === brandId);
    if (!b) throw new Error("Marca no encontrada");
    return b;
  },

  products: async (brandId: string, filters?: ProductFilters) => {
    const items = filterProducts(mockStore.products.filter((p) => p.brandId === brandId), filters);
    return mockPaginated(items, filters?.page, filters?.pageSize);
  },

  availability: async (brandId: string, filters?: AvailabilityFilters) =>
    filterAvailability(brandId, filters),

  compareAvailability: async (_brandId: string, productId: string) =>
    mockStore.availability.filter((a) => a.productId === productId),

  news: async (filters?: NewsFilters) => {
    let items = mockStore.news.filter((n) => n.status === "PUBLISHED");
    if (filters?.brandId) items = items.filter((n) => n.brandId === filters.brandId);
    if (filters?.type) items = items.filter((n) => n.type === filters.type);
    return mockPaginated(items, filters?.page, filters?.pageSize);
  },

  campaigns: async (brandId?: string) => {
    let list = mockStore.campaigns.filter((c) => c.status === "ACTIVE");
    if (brandId) list = list.filter((c) => c.brandId === brandId);
    return list;
  },

  materials: async (brandId?: string, _type?: string) => {
    let list = [...mockStore.materials];
    if (brandId) list = list.filter((m) => m.brandId === brandId);
    return list;
  },

  trainings: async (brandId?: string) => {
    let list = [...mockStore.trainings];
    if (brandId) list = list.filter((t) => t.brandId === brandId);
    return list;
  },

  favorites: async () => [...mockStore.favorites],

  addFavorite: async (brandId: string, productId: string) => mockStore.addFavorite(brandId, productId),

  removeFavorite: async (brandId: string, productId: string) => {
    mockStore.removeFavorite(brandId, productId);
  },

  notifications: async (unreadOnly?: boolean) => {
    let list = [...mockStore.notifications];
    if (unreadOnly) list = list.filter((n) => !n.read);
    return list;
  },

  markNotificationRead: async (id: string) => mockStore.markNotificationRead(id)!,

  markAllNotificationsRead: async () => { mockStore.markAllNotificationsRead(); },

  invitations: async () => [...mockStore.pendingInvitations],

  acceptInvitation: async (accessId: string) => mockStore.acceptInvitation(accessId)!,

  rejectInvitation: async (accessId: string) => {
    mockStore.pendingInvitations = mockStore.pendingInvitations.filter((x) => x.id !== accessId);
    return { id: accessId, brandId: MOCK_BRAND_MSI_ID, userEmail: "", status: "REJECTED" as const, invitedAt: new Date().toISOString(), userTags: [], blockedByAdmin: false };
  },

  pinBrand: async () => {},
  hideBrand: async () => {},

  exportAvailability: async () =>
    mockBlob("sku,producto,distribuidor,estado\nGB-B550M-DS3H,B550M DS3H,ELIT,HIGH_STOCK\n"),
};

export const mockBrandPanelApi = {
  dashboard: async () => ({
    ...MOCK_DASHBOARD_STATS,
    productCount: mockStore.gigabyteProducts().length,
    pendingInvitations: mockStore.accesses.filter((a) => a.status === "INVITATION_SENT").length,
  }),

  profile: async () => MOCK_BRANDS[0],

  updateProfile: async (data: BrandProfileInput) => ({ ...MOCK_BRANDS[0], ...data, updatedAt: new Date().toISOString() }),

  uploadLogo: async (_file?: File) => ({ logoUrl: "https://placehold.co/120x120/1e40af/white?text=GB" }),

  products: async (filters?: ProductFilters) =>
    mockPaginated(filterProducts(mockStore.gigabyteProducts(), filters), filters?.page, filters?.pageSize),

  getProduct: async (id: string) => mockStore.products.find((p) => p.id === id)!,

  createProduct: async (data: BrandProductInput) => mockStore.addProduct(data),

  updateProduct: async (id: string, data: Partial<BrandProductInput>) => mockStore.updateProduct(id, data),

  deactivateProduct: async (id: string) => mockStore.updateProduct(id, { active: false }),

  productHistory: async (_id?: string) => MOCK_AUDIT.filter((a) => a.entityType === "PRODUCT"),

  uploadProductImage: async (_productId?: string, _file?: File) => ({ imageUrl: "https://placehold.co/200x200" }),

  availability: async (filters?: AvailabilityFilters) => ({
    ...filterAvailability(MOCK_BRAND_GIGABYTE_ID, filters),
    distributors: MOCK_BRAND_DISTRIBUTORS,
  }),

  updateAvailability: async (data: AvailabilityInput) =>
    mockStore.updateAvailability(data.productId, data.distributorId, data.status),

  bulkUpdateAvailability: async (items: AvailabilityInput[]) =>
    items.map((i) => mockStore.updateAvailability(i.productId, i.distributorId, i.status)),

  availabilityHistory: async (_productId?: string) => MOCK_AUDIT.filter((a) => a.entityType === "AVAILABILITY"),

  distributors: async () => MOCK_BRAND_DISTRIBUTORS,

  linkDistributor: async (distributorId: string) => {
    const d = MOCK_DISTRIBUTORS.find((x) => x.id === distributorId)!;
    return {
      id: mockStore.nextId("mock-bd"),
      brandId: MOCK_BRAND_GIGABYTE_ID,
      distributorId: d.id,
      distributor: d,
      active: true,
      visibleToUsers: true,
      createdAt: new Date().toISOString(),
    };
  },

  updateBrandDistributor: async (id: string, data: { active?: boolean; visibleToUsers?: boolean }) => {
    const bd = MOCK_BRAND_DISTRIBUTORS.find((x) => x.id === id)!;
    return { ...bd, ...data };
  },

  downloadTemplate: async () =>
    mockBlob("marca,categoria,sku,modelo,nombre_comercial,distribuidor,estado_stock\nGigabyte,Motherboards,GB-TEST,TEST,Producto Test,ELIT,HIGH_STOCK\n"),

  uploadImport: async (_file?: File) => mockImportPreview(),

  confirmImport: async (importId: string) => mockStore.confirmImport(importId),

  importHistory: async () => [...mockStore.imports],

  getImport: async (id: string) => mockStore.imports.find((i) => i.id === id)!,

  downloadImportErrors: async (_id?: string) => mockBlob("fila,columna,error\n5,distribuidor,No encontrado\n"),

  revertImport: async (id: string) => mockStore.imports.find((i) => i.id === id)!,

  authorizedUsers: async () => mockStore.accesses,

  inviteUser: async (data: InviteUserInput) => mockStore.inviteUser(data.email),

  inviteBulk: async (emails: string[]) => emails.map((e) => mockStore.inviteUser(e)),

  resendInvitation: async (accessId: string) => mockStore.accesses.find((a) => a.id === accessId)!,

  revokeAccess: async (accessId: string) => mockStore.revokeAccess(accessId)!,

  news: async (_status?: string) => mockStore.news,

  createNews: async (data: BrandNewsInput) => mockStore.addNews(data),

  updateNews: async (id: string, data: Partial<BrandNewsInput>) => {
    const n = mockStore.news.find((x) => x.id === id)!;
    return { ...n, ...data, updatedAt: new Date().toISOString() };
  },

  archiveNews: async (id: string) => {
    const n = mockStore.news.find((x) => x.id === id)!;
    n.status = "ARCHIVED";
    return n;
  },

  campaigns: async () => mockStore.campaigns,

  createCampaign: async (data: Parameters<typeof mockStore.addCampaign>[0]) => mockStore.addCampaign(data),

  updateCampaign: async (id: string, data: Record<string, unknown>) => {
    const c = mockStore.campaigns.find((x) => x.id === id)!;
    return { ...c, ...data };
  },

  materials: async () => mockStore.materials,

  uploadMaterial: async (data: { title: string; type: string }, _file?: File) =>
    mockStore.addMaterial({ title: data.title, type: data.type as "CATALOG" }),

  deleteMaterial: async (id: string) => {
    mockStore.materials = mockStore.materials.filter((m) => m.id !== id);
  },

  trainings: async () => mockStore.trainings,

  createTraining: async (data: Parameters<typeof mockStore.addTraining>[0]) => mockStore.addTraining(data),

  deleteTraining: async (id: string) => {
    mockStore.trainings = mockStore.trainings.filter((t) => t.id !== id);
  },

  auditLog: async (_entityType?: string, _page?: number) =>
    mockPaginated(
      _entityType ? MOCK_AUDIT.filter((a) => a.entityType === _entityType) : MOCK_AUDIT
    ),

  stats: async () => ({ views: 142, downloads: 38, favorites: mockStore.favorites.length }),
};

export const mockAdminBrandsApi = {
  metrics: async () => MOCK_ADMIN_METRICS,

  brands: async () => MOCK_BRANDS,

  createBrand: async (data: AdminBrandInput) => ({
    id: mockStore.nextId("mock-brand"),
    name: data.name,
    slug: data.slug ?? data.name.toLowerCase(),
    contactEmail: data.contactEmail,
    description: data.description,
    active: true,
    suspended: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),

  updateBrand: async (id: string, data: Partial<BrandAccount>) => {
    const b = MOCK_BRANDS.find((x) => x.id === id)!;
    return { ...b, ...data, updatedAt: new Date().toISOString() };
  },

  suspendBrand: async (id: string, suspended: boolean) => {
    const b = MOCK_BRANDS.find((x) => x.id === id)!;
    return { ...b, suspended };
  },

  deleteBrand: async (_id?: string) => {},

  distributors: async () => MOCK_DISTRIBUTORS,

  createDistributor: async (data: AdminDistributorInput) => ({
    id: mockStore.nextId("mock-dist"),
    name: data.name,
    code: data.code,
    region: data.region,
    active: true,
    createdAt: new Date().toISOString(),
  }),

  updateDistributor: async (id: string, data: Partial<AdminDistributorInput>) => {
    const d = MOCK_DISTRIBUTORS.find((x) => x.id === id)!;
    return { ...d, ...data };
  },

  accesses: async (_filters?: { brandId?: string; userId?: string; status?: string }) => mockStore.accesses,

  blockAccess: async (accessId: string, blocked: boolean) => {
    const a = mockStore.accesses.find((x) => x.id === accessId)!;
    a.blockedByAdmin = blocked;
    if (blocked) a.status = "BLOCKED_BY_ADMIN";
    return a;
  },

  revokeAccess: async (accessId: string) => mockStore.revokeAccess(accessId)!,

  categories: async () => mockStore.categories,

  createCategory: async (data: { name: string }) => mockStore.addCategory(data.name),

  updateCategory: async (id: string, data: { name?: string; active?: boolean }) => {
    const c = mockStore.categories.find((x) => x.id === id)!;
    return { ...c, ...data };
  },

  auditLog: async (_filters?: { brandId?: string; entityType?: string; page?: number }) => mockPaginated(MOCK_AUDIT),

  importHistory: async (_brandId?: string) => mockStore.imports,

  users: async () => [
    { id: "mock-user-1", username: "demo", email: "demo@casacomputacion.com", role: "ROLE_USER", active: true },
    { id: "mock-brand-user", username: "gigabyte_admin", email: "admin@gigabyte.com", role: "ROLE_BRAND", active: true },
  ],
};