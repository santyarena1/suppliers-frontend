import api from "@/lib/api";
import type { ApiResponse, Paginated } from "./types";
import type {
  AdminBrandInput,
  AdminDistributorInput,
  AuditLogEntry,
  AvailabilityFilters,
  AvailabilityInput,
  BrandAccess,
  BrandAccount,
  BrandCampaign,
  BrandDashboardStats,
  BrandDistributor,
  BrandFavorite,
  BrandMaterial,
  BrandNews,
  BrandNewsInput,
  BrandNotification,
  BrandProduct,
  BrandProductInput,
  BrandProfileInput,
  BrandTraining,
  Category,
  Distributor,
  ImportPreview,
  ImportRecord,
  InviteUserInput,
  NewsFilters,
  ProductAvailability,
  ProductFilters,
  UserBrandDashboard,
} from "./types";

const unwrap = <T>(r: { data: ApiResponse<T> }) => r.data.data;

// ═══════════════════════════════════════════════════════════════
// PORTAL USUARIO — solo marcas autorizadas
// ═══════════════════════════════════════════════════════════════

export const userBrandsApi = {
  dashboard: () =>
    api.get<ApiResponse<UserBrandDashboard>>("/marcas/dashboard").then(unwrap),

  /** Solo marcas a las que el usuario tiene acceso activo */
  authorized: () =>
    api.get<ApiResponse<BrandAccess[]>>("/marcas/authorized").then(unwrap),

  /** Detalle de marca — 403 si no autorizado */
  getBrand: (brandId: string) =>
    api.get<ApiResponse<BrandAccount>>(`/marcas/${brandId}`).then(unwrap),

  products: (brandId: string, filters?: ProductFilters) =>
    api
      .get<ApiResponse<Paginated<BrandProduct>>>(`/marcas/${brandId}/products`, { params: filters })
      .then(unwrap),

  availability: (brandId: string, filters?: AvailabilityFilters) =>
    api
      .get<ApiResponse<{ products: BrandProduct[]; matrix: ProductAvailability[] }>>(
        `/marcas/${brandId}/availability`,
        { params: filters }
      )
      .then(unwrap),

  compareAvailability: (brandId: string, productId: string) =>
    api
      .get<ApiResponse<ProductAvailability[]>>(`/marcas/${brandId}/products/${productId}/availability`)
      .then(unwrap),

  news: (filters?: NewsFilters) =>
    api.get<ApiResponse<Paginated<BrandNews>>>("/marcas/news", { params: filters }).then(unwrap),

  campaigns: (brandId?: string) =>
    api
      .get<ApiResponse<BrandCampaign[]>>("/marcas/campaigns", { params: { brandId } })
      .then(unwrap),

  materials: (brandId?: string, type?: string) =>
    api
      .get<ApiResponse<BrandMaterial[]>>("/marcas/materials", { params: { brandId, type } })
      .then(unwrap),

  trainings: (brandId?: string) =>
    api.get<ApiResponse<BrandTraining[]>>("/marcas/trainings", { params: { brandId } }).then(unwrap),

  favorites: () =>
    api.get<ApiResponse<BrandFavorite[]>>("/marcas/favorites").then(unwrap),

  addFavorite: (brandId: string, productId: string) =>
    api.post<ApiResponse<BrandFavorite>>(`/marcas/${brandId}/favorites`, { productId }).then(unwrap),

  removeFavorite: (brandId: string, productId: string) =>
    api.delete(`/marcas/${brandId}/favorites/${productId}`),

  notifications: (unreadOnly?: boolean) =>
    api
      .get<ApiResponse<BrandNotification[]>>("/marcas/notifications", { params: { unreadOnly } })
      .then(unwrap),

  markNotificationRead: (id: string) =>
    api.patch<ApiResponse<BrandNotification>>(`/marcas/notifications/${id}/read`).then(unwrap),

  markAllNotificationsRead: () =>
    api.patch<ApiResponse<void>>("/marcas/notifications/read-all"),

  invitations: () =>
    api.get<ApiResponse<BrandAccess[]>>("/marcas/invitations/pending").then(unwrap),

  acceptInvitation: (accessId: string) =>
    api.post<ApiResponse<BrandAccess>>(`/marcas/invitations/${accessId}/accept`).then(unwrap),

  rejectInvitation: (accessId: string) =>
    api.post<ApiResponse<BrandAccess>>(`/marcas/invitations/${accessId}/reject`).then(unwrap),

  pinBrand: (brandId: string, pinned: boolean) =>
    api.patch<ApiResponse<void>>(`/marcas/${brandId}/pin`, { pinned }),

  hideBrand: (brandId: string, hidden: boolean) =>
    api.patch<ApiResponse<void>>(`/marcas/${brandId}/visibility`, { hidden }),

  exportAvailability: (brandId: string, filters?: AvailabilityFilters) =>
    api.get(`/marcas/${brandId}/availability/export`, { params: filters, responseType: "blob" }),
};

// ═══════════════════════════════════════════════════════════════
// PANEL MARCA — solo su propia marca
// ═══════════════════════════════════════════════════════════════

export const brandPanelApi = {
  dashboard: () =>
    api.get<ApiResponse<BrandDashboardStats>>("/brand/dashboard").then(unwrap),

  profile: () =>
    api.get<ApiResponse<BrandAccount>>("/brand/profile").then(unwrap),

  updateProfile: (data: BrandProfileInput) =>
    api.put<ApiResponse<BrandAccount>>("/brand/profile", data).then(unwrap),

  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<ApiResponse<{ logoUrl: string }>>("/brand/profile/logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then(unwrap);
  },

  // Productos
  products: (filters?: ProductFilters) =>
    api.get<ApiResponse<Paginated<BrandProduct>>>("/brand/products", { params: filters }).then(unwrap),

  getProduct: (id: string) =>
    api.get<ApiResponse<BrandProduct>>(`/brand/products/${id}`).then(unwrap),

  createProduct: (data: BrandProductInput) =>
    api.post<ApiResponse<BrandProduct>>("/brand/products", data).then(unwrap),

  updateProduct: (id: string, data: Partial<BrandProductInput>) =>
    api.put<ApiResponse<BrandProduct>>(`/brand/products/${id}`, data).then(unwrap),

  deactivateProduct: (id: string) =>
    api.patch<ApiResponse<BrandProduct>>(`/brand/products/${id}/deactivate`).then(unwrap),

  productHistory: (id: string) =>
    api.get<ApiResponse<AuditLogEntry[]>>(`/brand/products/${id}/history`).then(unwrap),

  uploadProductImage: (productId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<ApiResponse<{ imageUrl: string }>>(`/brand/products/${productId}/images`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then(unwrap);
  },

  // Disponibilidad (Mapa de Disponibilidad)
  availability: (filters?: AvailabilityFilters) =>
    api
      .get<ApiResponse<{ products: BrandProduct[]; matrix: ProductAvailability[]; distributors: BrandDistributor[] }>>(
        "/brand/availability",
        { params: filters }
      )
      .then(unwrap),

  updateAvailability: (data: AvailabilityInput) =>
    api.put<ApiResponse<ProductAvailability>>("/brand/availability", data).then(unwrap),

  bulkUpdateAvailability: (items: AvailabilityInput[]) =>
    api.put<ApiResponse<ProductAvailability[]>>("/brand/availability/bulk", { items }).then(unwrap),

  availabilityHistory: (productId?: string) =>
    api
      .get<ApiResponse<AuditLogEntry[]>>("/brand/availability/history", { params: { productId } })
      .then(unwrap),

  // Distribuidores
  distributors: () =>
    api.get<ApiResponse<BrandDistributor[]>>("/brand/distributors").then(unwrap),

  linkDistributor: (distributorId: string, data?: { commercialNotes?: string; visibleToUsers?: boolean }) =>
    api.post<ApiResponse<BrandDistributor>>("/brand/distributors", { distributorId, ...data }).then(unwrap),

  updateBrandDistributor: (id: string, data: { active?: boolean; visibleToUsers?: boolean; commercialNotes?: string }) =>
    api.patch<ApiResponse<BrandDistributor>>(`/brand/distributors/${id}`, data).then(unwrap),

  // Importaciones
  downloadTemplate: () =>
    api.get("/brand/imports/template", { responseType: "blob" }),

  uploadImport: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post<ApiResponse<ImportPreview>>("/brand/imports/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then(unwrap);
  },

  confirmImport: (importId: string) =>
    api.post<ApiResponse<ImportRecord>>(`/brand/imports/${importId}/confirm`).then(unwrap),

  importHistory: () =>
    api.get<ApiResponse<ImportRecord[]>>("/brand/imports").then(unwrap),

  getImport: (id: string) =>
    api.get<ApiResponse<ImportRecord>>(`/brand/imports/${id}`).then(unwrap),

  downloadImportErrors: (id: string) =>
    api.get(`/brand/imports/${id}/errors`, { responseType: "blob" }),

  revertImport: (id: string) =>
    api.post<ApiResponse<ImportRecord>>(`/brand/imports/${id}/revert`).then(unwrap),

  // Usuarios autorizados
  authorizedUsers: () =>
    api.get<ApiResponse<BrandAccess[]>>("/brand/users").then(unwrap),

  inviteUser: (data: InviteUserInput) =>
    api.post<ApiResponse<BrandAccess>>("/brand/users/invite", data).then(unwrap),

  inviteBulk: (emails: string[], requireAcceptance?: boolean) =>
    api.post<ApiResponse<BrandAccess[]>>("/brand/users/invite-bulk", { emails, requireAcceptance }).then(unwrap),

  resendInvitation: (accessId: string) =>
    api.post<ApiResponse<BrandAccess>>(`/brand/users/${accessId}/resend`).then(unwrap),

  revokeAccess: (accessId: string) =>
    api.post<ApiResponse<BrandAccess>>(`/brand/users/${accessId}/revoke`).then(unwrap),

  // Novedades
  news: (status?: string) =>
    api.get<ApiResponse<BrandNews[]>>("/brand/news", { params: { status } }).then(unwrap),

  createNews: (data: BrandNewsInput) =>
    api.post<ApiResponse<BrandNews>>("/brand/news", data).then(unwrap),

  updateNews: (id: string, data: Partial<BrandNewsInput>) =>
    api.put<ApiResponse<BrandNews>>(`/brand/news/${id}`, data).then(unwrap),

  archiveNews: (id: string) =>
    api.patch<ApiResponse<BrandNews>>(`/brand/news/${id}/archive`).then(unwrap),

  // Campañas
  campaigns: () =>
    api.get<ApiResponse<BrandCampaign[]>>("/brand/campaigns").then(unwrap),

  createCampaign: (data: Omit<BrandCampaign, "id" | "brandId" | "createdAt">) =>
    api.post<ApiResponse<BrandCampaign>>("/brand/campaigns", data).then(unwrap),

  updateCampaign: (id: string, data: Partial<BrandCampaign>) =>
    api.put<ApiResponse<BrandCampaign>>(`/brand/campaigns/${id}`, data).then(unwrap),

  // Materiales
  materials: () =>
    api.get<ApiResponse<BrandMaterial[]>>("/brand/materials").then(unwrap),

  uploadMaterial: (data: { title: string; type: string; productIds?: string[]; description?: string }, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("metadata", JSON.stringify(data));
    return api
      .post<ApiResponse<BrandMaterial>>("/brand/materials", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then(unwrap);
  },

  deleteMaterial: (id: string) => api.delete(`/brand/materials/${id}`),

  // Capacitaciones
  trainings: () =>
    api.get<ApiResponse<BrandTraining[]>>("/brand/trainings").then(unwrap),

  createTraining: (data: Omit<BrandTraining, "id" | "brandId" | "createdAt">) =>
    api.post<ApiResponse<BrandTraining>>("/brand/trainings", data).then(unwrap),

  deleteTraining: (id: string) => api.delete(`/brand/trainings/${id}`),

  // Historial / auditoría propia
  auditLog: (entityType?: string, page?: number) =>
    api
      .get<ApiResponse<Paginated<AuditLogEntry>>>("/brand/audit", { params: { entityType, page } })
      .then(unwrap),

  // Estadísticas básicas
  stats: () =>
    api.get<ApiResponse<Record<string, number>>>("/brand/stats").then(unwrap),
};

// ═══════════════════════════════════════════════════════════════
// ADMIN — control total del módulo de marcas
// ═══════════════════════════════════════════════════════════════

export const adminBrandsApi = {
  metrics: () =>
    api.get<ApiResponse<Record<string, number>>>("/admin/marcas/metrics").then(unwrap),

  // Marcas
  brands: () =>
    api.get<ApiResponse<BrandAccount[]>>("/admin/marcas/brands").then(unwrap),

  createBrand: (data: AdminBrandInput) =>
    api.post<ApiResponse<BrandAccount>>("/admin/marcas/brands", data).then(unwrap),

  updateBrand: (id: string, data: Partial<BrandAccount>) =>
    api.put<ApiResponse<BrandAccount>>(`/admin/marcas/brands/${id}`, data).then(unwrap),

  suspendBrand: (id: string, suspended: boolean) =>
    api.patch<ApiResponse<BrandAccount>>(`/admin/marcas/brands/${id}/suspend`, { suspended }).then(unwrap),

  deleteBrand: (id: string) =>
    api.delete(`/admin/marcas/brands/${id}`),

  // Distribuidores globales
  distributors: () =>
    api.get<ApiResponse<Distributor[]>>("/admin/marcas/distributors").then(unwrap),

  createDistributor: (data: AdminDistributorInput) =>
    api.post<ApiResponse<Distributor>>("/admin/marcas/distributors", data).then(unwrap),

  updateDistributor: (id: string, data: Partial<AdminDistributorInput & { active: boolean }>) =>
    api.put<ApiResponse<Distributor>>(`/admin/marcas/distributors/${id}`, data).then(unwrap),

  // Accesos marca-usuario
  accesses: (filters?: { brandId?: string; userId?: string; status?: string }) =>
    api.get<ApiResponse<BrandAccess[]>>("/admin/marcas/accesses", { params: filters }).then(unwrap),

  blockAccess: (accessId: string, blocked: boolean) =>
    api.patch<ApiResponse<BrandAccess>>(`/admin/marcas/accesses/${accessId}/block`, { blocked }).then(unwrap),

  revokeAccess: (accessId: string) =>
    api.post<ApiResponse<BrandAccess>>(`/admin/marcas/accesses/${accessId}/revoke`).then(unwrap),

  // Categorías
  categories: () =>
    api.get<ApiResponse<Category[]>>("/admin/marcas/categories").then(unwrap),

  createCategory: (data: { name: string; parentId?: string }) =>
    api.post<ApiResponse<Category>>("/admin/marcas/categories", data).then(unwrap),

  updateCategory: (id: string, data: { name?: string; active?: boolean }) =>
    api.put<ApiResponse<Category>>(`/admin/marcas/categories/${id}`, data).then(unwrap),

  // Auditoría global
  auditLog: (filters?: { brandId?: string; entityType?: string; page?: number }) =>
    api
      .get<ApiResponse<Paginated<AuditLogEntry>>>("/admin/marcas/audit", { params: filters })
      .then(unwrap),

  importHistory: (brandId?: string) =>
    api.get<ApiResponse<ImportRecord[]>>("/admin/marcas/imports", { params: { brandId } }).then(unwrap),

  // Usuarios (extensión admin)
  users: () =>
    api.get<ApiResponse<{ id: string; username: string; email: string; role: string; active: boolean }[]>>(
      "/admin/users"
    ).then(unwrap),
};

export * from "./types";
export * from "./constants";
