/**
 * API del módulo Marcas con fallback automático al backend.
 *
 * Flujo: intenta api.live.ts → si falla, usa _dev-fallback/mock-api.ts
 *
 * Para eliminar mocks: ver lib/brands/_dev-fallback/config.ts
 */
import {
  userBrandsApi as liveUserBrandsApi,
  brandPanelApi as liveBrandPanelApi,
  adminBrandsApi as liveAdminBrandsApi,
} from "./api.live";
import {
  withFallback,
  mockUserBrandsApi,
  mockBrandPanelApi,
  mockAdminBrandsApi,
} from "./_dev-fallback";

const fb = withFallback;

export const userBrandsApi = {
  dashboard: () => fb("user.dashboard", () => liveUserBrandsApi.dashboard(), () => mockUserBrandsApi.dashboard()),
  authorized: () => fb("user.authorized", () => liveUserBrandsApi.authorized(), () => mockUserBrandsApi.authorized()),
  getBrand: (brandId: string) => fb(`user.getBrand.${brandId}`, () => liveUserBrandsApi.getBrand(brandId), () => mockUserBrandsApi.getBrand(brandId)),
  products: (brandId: string, filters?: Parameters<typeof liveUserBrandsApi.products>[1]) =>
    fb("user.products", () => liveUserBrandsApi.products(brandId, filters), () => mockUserBrandsApi.products(brandId, filters)),
  availability: (brandId: string, filters?: Parameters<typeof liveUserBrandsApi.availability>[1]) =>
    fb("user.availability", () => liveUserBrandsApi.availability(brandId, filters), () => mockUserBrandsApi.availability(brandId, filters)),
  compareAvailability: (brandId: string, productId: string) =>
    fb("user.compare", () => liveUserBrandsApi.compareAvailability(brandId, productId), () => mockUserBrandsApi.compareAvailability(brandId, productId)),
  news: (filters?: Parameters<typeof liveUserBrandsApi.news>[0]) =>
    fb("user.news", () => liveUserBrandsApi.news(filters), () => mockUserBrandsApi.news(filters)),
  campaigns: (brandId?: string) =>
    fb("user.campaigns", () => liveUserBrandsApi.campaigns(brandId), () => mockUserBrandsApi.campaigns(brandId)),
  materials: (brandId?: string, type?: string) =>
    fb("user.materials", () => liveUserBrandsApi.materials(brandId, type), () => mockUserBrandsApi.materials(brandId, type)),
  trainings: (brandId?: string) =>
    fb("user.trainings", () => liveUserBrandsApi.trainings(brandId), () => mockUserBrandsApi.trainings(brandId)),
  favorites: () => fb("user.favorites", () => liveUserBrandsApi.favorites(), () => mockUserBrandsApi.favorites()),
  addFavorite: (brandId: string, productId: string) =>
    fb("user.addFavorite", () => liveUserBrandsApi.addFavorite(brandId, productId), () => mockUserBrandsApi.addFavorite(brandId, productId)),
  removeFavorite: (brandId: string, productId: string) =>
    fb("user.removeFavorite", () => liveUserBrandsApi.removeFavorite(brandId, productId), async () => {
      await mockUserBrandsApi.removeFavorite(brandId, productId);
      return undefined;
    }) as ReturnType<typeof liveUserBrandsApi.removeFavorite>,
  notifications: (unreadOnly?: boolean) =>
    fb("user.notifications", () => liveUserBrandsApi.notifications(unreadOnly), () => mockUserBrandsApi.notifications(unreadOnly)),
  markNotificationRead: (id: string) =>
    fb("user.markRead", () => liveUserBrandsApi.markNotificationRead(id), () => mockUserBrandsApi.markNotificationRead(id)),
  markAllNotificationsRead: () =>
    fb("user.markAllRead", () => liveUserBrandsApi.markAllNotificationsRead(), async () => {
      await mockUserBrandsApi.markAllNotificationsRead();
      return undefined;
    }) as ReturnType<typeof liveUserBrandsApi.markAllNotificationsRead>,
  invitations: () => fb("user.invitations", () => liveUserBrandsApi.invitations(), () => mockUserBrandsApi.invitations()),
  acceptInvitation: (accessId: string) =>
    fb("user.acceptInvite", () => liveUserBrandsApi.acceptInvitation(accessId), () => mockUserBrandsApi.acceptInvitation(accessId)),
  rejectInvitation: (accessId: string) =>
    fb("user.rejectInvite", () => liveUserBrandsApi.rejectInvitation(accessId), () => mockUserBrandsApi.rejectInvitation(accessId)),
  pinBrand: (brandId: string, pinned: boolean) =>
    fb("user.pin", () => liveUserBrandsApi.pinBrand(brandId, pinned), async () => {
      await mockUserBrandsApi.pinBrand();
      return undefined;
    }) as ReturnType<typeof liveUserBrandsApi.pinBrand>,
  hideBrand: (brandId: string, hidden: boolean) =>
    fb("user.hide", () => liveUserBrandsApi.hideBrand(brandId, hidden), async () => {
      await mockUserBrandsApi.hideBrand();
      return undefined;
    }) as ReturnType<typeof liveUserBrandsApi.hideBrand>,
  exportAvailability: (brandId: string, filters?: Parameters<typeof liveUserBrandsApi.exportAvailability>[1]) =>
    fb("user.export", () => liveUserBrandsApi.exportAvailability(brandId, filters), async () =>
      (await mockUserBrandsApi.exportAvailability()) as Awaited<ReturnType<typeof liveUserBrandsApi.exportAvailability>>
    ),
};

export const brandPanelApi = {
  dashboard: () => fb("brand.dashboard", () => liveBrandPanelApi.dashboard(), () => mockBrandPanelApi.dashboard()),
  profile: () => fb("brand.profile", () => liveBrandPanelApi.profile(), () => mockBrandPanelApi.profile()),
  updateProfile: (data: Parameters<typeof liveBrandPanelApi.updateProfile>[0]) =>
    fb("brand.updateProfile", () => liveBrandPanelApi.updateProfile(data), () => mockBrandPanelApi.updateProfile(data)),
  uploadLogo: (file: File) =>
    fb("brand.uploadLogo", () => liveBrandPanelApi.uploadLogo(file), () => mockBrandPanelApi.uploadLogo(file)),
  products: (filters?: Parameters<typeof liveBrandPanelApi.products>[0]) =>
    fb("brand.products", () => liveBrandPanelApi.products(filters), () => mockBrandPanelApi.products(filters)),
  getProduct: (id: string) =>
    fb("brand.getProduct", () => liveBrandPanelApi.getProduct(id), () => mockBrandPanelApi.getProduct(id)),
  createProduct: (data: Parameters<typeof liveBrandPanelApi.createProduct>[0]) =>
    fb("brand.createProduct", () => liveBrandPanelApi.createProduct(data), () => mockBrandPanelApi.createProduct(data)),
  updateProduct: (id: string, data: Parameters<typeof liveBrandPanelApi.updateProduct>[1]) =>
    fb("brand.updateProduct", () => liveBrandPanelApi.updateProduct(id, data), () => mockBrandPanelApi.updateProduct(id, data)),
  deactivateProduct: (id: string) =>
    fb("brand.deactivate", () => liveBrandPanelApi.deactivateProduct(id), () => mockBrandPanelApi.deactivateProduct(id)),
  productHistory: (id: string) =>
    fb("brand.productHistory", () => liveBrandPanelApi.productHistory(id), () => mockBrandPanelApi.productHistory(id)),
  uploadProductImage: (productId: string, file: File) =>
    fb("brand.uploadImage", () => liveBrandPanelApi.uploadProductImage(productId, file), () => mockBrandPanelApi.uploadProductImage(productId, file)),
  availability: (filters?: Parameters<typeof liveBrandPanelApi.availability>[0]) =>
    fb("brand.availability", () => liveBrandPanelApi.availability(filters), () => mockBrandPanelApi.availability(filters)),
  updateAvailability: (data: Parameters<typeof liveBrandPanelApi.updateAvailability>[0]) =>
    fb("brand.updateAv", () => liveBrandPanelApi.updateAvailability(data), () => mockBrandPanelApi.updateAvailability(data)),
  bulkUpdateAvailability: (items: Parameters<typeof liveBrandPanelApi.bulkUpdateAvailability>[0]) =>
    fb("brand.bulkAv", () => liveBrandPanelApi.bulkUpdateAvailability(items), () => mockBrandPanelApi.bulkUpdateAvailability(items)),
  availabilityHistory: (productId?: string) =>
    fb("brand.avHistory", () => liveBrandPanelApi.availabilityHistory(productId), () => mockBrandPanelApi.availabilityHistory(productId)),
  distributors: () => fb("brand.distributors", () => liveBrandPanelApi.distributors(), () => mockBrandPanelApi.distributors()),
  linkDistributor: (distributorId: string, data?: Parameters<typeof liveBrandPanelApi.linkDistributor>[1]) =>
    fb("brand.linkDist", () => liveBrandPanelApi.linkDistributor(distributorId, data), () => mockBrandPanelApi.linkDistributor(distributorId)),
  updateBrandDistributor: (id: string, data: Parameters<typeof liveBrandPanelApi.updateBrandDistributor>[1]) =>
    fb("brand.updateDist", () => liveBrandPanelApi.updateBrandDistributor(id, data), () => mockBrandPanelApi.updateBrandDistributor(id, data)),
  downloadTemplate: () =>
    fb("brand.template", () => liveBrandPanelApi.downloadTemplate(), async () =>
      (await mockBrandPanelApi.downloadTemplate()) as Awaited<ReturnType<typeof liveBrandPanelApi.downloadTemplate>>
    ),
  uploadImport: (file: File) =>
    fb("brand.uploadImport", () => liveBrandPanelApi.uploadImport(file), () => mockBrandPanelApi.uploadImport(file)),
  confirmImport: (importId: string) =>
    fb("brand.confirmImport", () => liveBrandPanelApi.confirmImport(importId), () => mockBrandPanelApi.confirmImport(importId)),
  importHistory: () => fb("brand.imports", () => liveBrandPanelApi.importHistory(), () => mockBrandPanelApi.importHistory()),
  getImport: (id: string) =>
    fb("brand.getImport", () => liveBrandPanelApi.getImport(id), () => mockBrandPanelApi.getImport(id)),
  downloadImportErrors: (id: string) =>
    fb("brand.importErrors", () => liveBrandPanelApi.downloadImportErrors(id), async () =>
      (await mockBrandPanelApi.downloadImportErrors(id)) as Awaited<ReturnType<typeof liveBrandPanelApi.downloadImportErrors>>
    ),
  revertImport: (id: string) =>
    fb("brand.revertImport", () => liveBrandPanelApi.revertImport(id), () => mockBrandPanelApi.revertImport(id)),
  authorizedUsers: () => fb("brand.users", () => liveBrandPanelApi.authorizedUsers(), () => mockBrandPanelApi.authorizedUsers()),
  inviteUser: (data: Parameters<typeof liveBrandPanelApi.inviteUser>[0]) =>
    fb("brand.invite", () => liveBrandPanelApi.inviteUser(data), () => mockBrandPanelApi.inviteUser(data)),
  inviteBulk: (emails: string[], requireAcceptance?: boolean) =>
    fb("brand.inviteBulk", () => liveBrandPanelApi.inviteBulk(emails, requireAcceptance), () => mockBrandPanelApi.inviteBulk(emails)),
  resendInvitation: (accessId: string) =>
    fb("brand.resend", () => liveBrandPanelApi.resendInvitation(accessId), () => mockBrandPanelApi.resendInvitation(accessId)),
  revokeAccess: (accessId: string) =>
    fb("brand.revoke", () => liveBrandPanelApi.revokeAccess(accessId), () => mockBrandPanelApi.revokeAccess(accessId)),
  news: (status?: string) =>
    fb("brand.news", () => liveBrandPanelApi.news(status), () => mockBrandPanelApi.news(status)),
  createNews: (data: Parameters<typeof liveBrandPanelApi.createNews>[0]) =>
    fb("brand.createNews", () => liveBrandPanelApi.createNews(data), () => mockBrandPanelApi.createNews(data)),
  updateNews: (id: string, data: Parameters<typeof liveBrandPanelApi.updateNews>[1]) =>
    fb("brand.updateNews", () => liveBrandPanelApi.updateNews(id, data), () => mockBrandPanelApi.updateNews(id, data)),
  archiveNews: (id: string) =>
    fb("brand.archiveNews", () => liveBrandPanelApi.archiveNews(id), () => mockBrandPanelApi.archiveNews(id)),
  campaigns: () => fb("brand.campaigns", () => liveBrandPanelApi.campaigns(), () => mockBrandPanelApi.campaigns()),
  createCampaign: (data: Parameters<typeof liveBrandPanelApi.createCampaign>[0]) =>
    fb("brand.createCamp", () => liveBrandPanelApi.createCampaign(data), () => mockBrandPanelApi.createCampaign(data)),
  updateCampaign: (id: string, data: Parameters<typeof liveBrandPanelApi.updateCampaign>[1]) =>
    fb("brand.updateCamp", () => liveBrandPanelApi.updateCampaign(id, data), () => mockBrandPanelApi.updateCampaign(id, data)),
  materials: () => fb("brand.materials", () => liveBrandPanelApi.materials(), () => mockBrandPanelApi.materials()),
  uploadMaterial: (data: Parameters<typeof liveBrandPanelApi.uploadMaterial>[0], file: File) =>
    fb("brand.uploadMat", () => liveBrandPanelApi.uploadMaterial(data, file), () => mockBrandPanelApi.uploadMaterial(data, file)),
  deleteMaterial: (id: string) =>
    fb("brand.delMat", () => liveBrandPanelApi.deleteMaterial(id), async () => {
      await mockBrandPanelApi.deleteMaterial(id);
      return undefined;
    }) as ReturnType<typeof liveBrandPanelApi.deleteMaterial>,
  trainings: () => fb("brand.trainings", () => liveBrandPanelApi.trainings(), () => mockBrandPanelApi.trainings()),
  createTraining: (data: Parameters<typeof liveBrandPanelApi.createTraining>[0]) =>
    fb("brand.createTrain", () => liveBrandPanelApi.createTraining(data), () => mockBrandPanelApi.createTraining(data)),
  deleteTraining: (id: string) =>
    fb("brand.delTrain", () => liveBrandPanelApi.deleteTraining(id), async () => {
      await mockBrandPanelApi.deleteTraining(id);
      return undefined;
    }) as ReturnType<typeof liveBrandPanelApi.deleteTraining>,
  auditLog: (entityType?: string, page?: number) =>
    fb("brand.audit", () => liveBrandPanelApi.auditLog(entityType, page), () => mockBrandPanelApi.auditLog(entityType)),
  stats: () => fb("brand.stats", () => liveBrandPanelApi.stats(), () => mockBrandPanelApi.stats()),
};

export const adminBrandsApi = {
  metrics: () => fb("admin.metrics", () => liveAdminBrandsApi.metrics(), () => mockAdminBrandsApi.metrics()),
  brands: () => fb("admin.brands", () => liveAdminBrandsApi.brands(), () => mockAdminBrandsApi.brands()),
  createBrand: (data: Parameters<typeof liveAdminBrandsApi.createBrand>[0]) =>
    fb("admin.createBrand", () => liveAdminBrandsApi.createBrand(data), () => mockAdminBrandsApi.createBrand(data)),
  updateBrand: (id: string, data: Parameters<typeof liveAdminBrandsApi.updateBrand>[1]) =>
    fb("admin.updateBrand", () => liveAdminBrandsApi.updateBrand(id, data), () => mockAdminBrandsApi.updateBrand(id, data)),
  suspendBrand: (id: string, suspended: boolean) =>
    fb("admin.suspend", () => liveAdminBrandsApi.suspendBrand(id, suspended), () => mockAdminBrandsApi.suspendBrand(id, suspended)),
  deleteBrand: (id: string) =>
    fb("admin.deleteBrand", () => liveAdminBrandsApi.deleteBrand(id), async () => {
      await mockAdminBrandsApi.deleteBrand(id);
      return undefined;
    }) as ReturnType<typeof liveAdminBrandsApi.deleteBrand>,
  distributors: () => fb("admin.distributors", () => liveAdminBrandsApi.distributors(), () => mockAdminBrandsApi.distributors()),
  createDistributor: (data: Parameters<typeof liveAdminBrandsApi.createDistributor>[0]) =>
    fb("admin.createDist", () => liveAdminBrandsApi.createDistributor(data), () => mockAdminBrandsApi.createDistributor(data)),
  updateDistributor: (id: string, data: Parameters<typeof liveAdminBrandsApi.updateDistributor>[1]) =>
    fb("admin.updateDist", () => liveAdminBrandsApi.updateDistributor(id, data), () => mockAdminBrandsApi.updateDistributor(id, data)),
  accesses: (filters?: Parameters<typeof liveAdminBrandsApi.accesses>[0]) =>
    fb("admin.accesses", () => liveAdminBrandsApi.accesses(filters), () => mockAdminBrandsApi.accesses()),
  blockAccess: (accessId: string, blocked: boolean) =>
    fb("admin.block", () => liveAdminBrandsApi.blockAccess(accessId, blocked), () => mockAdminBrandsApi.blockAccess(accessId, blocked)),
  revokeAccess: (accessId: string) =>
    fb("admin.revoke", () => liveAdminBrandsApi.revokeAccess(accessId), () => mockAdminBrandsApi.revokeAccess(accessId)),
  categories: () => fb("admin.categories", () => liveAdminBrandsApi.categories(), () => mockAdminBrandsApi.categories()),
  createCategory: (data: Parameters<typeof liveAdminBrandsApi.createCategory>[0]) =>
    fb("admin.createCat", () => liveAdminBrandsApi.createCategory(data), () => mockAdminBrandsApi.createCategory(data)),
  updateCategory: (id: string, data: Parameters<typeof liveAdminBrandsApi.updateCategory>[1]) =>
    fb("admin.updateCat", () => liveAdminBrandsApi.updateCategory(id, data), () => mockAdminBrandsApi.updateCategory(id, data)),
  auditLog: (filters?: Parameters<typeof liveAdminBrandsApi.auditLog>[0]) =>
    fb("admin.audit", () => liveAdminBrandsApi.auditLog(filters), () => mockAdminBrandsApi.auditLog()),
  importHistory: (brandId?: string) =>
    fb("admin.imports", () => liveAdminBrandsApi.importHistory(brandId), () => mockAdminBrandsApi.importHistory()),
  users: () => fb("admin.users", () => liveAdminBrandsApi.users(), () => mockAdminBrandsApi.users()),
};

export * from "./types";
export * from "./constants";
