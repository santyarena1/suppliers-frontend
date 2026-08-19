/**
 * Store mutable en memoria para simular mutaciones durante pruebas.
 * Se reinicia al recargar la página.
 */
import type {
  BrandAccess,
  BrandCampaign,
  BrandMaterial,
  BrandNews,
  BrandProduct,
  BrandTraining,
  Category,
  ImportRecord,
  ProductAvailability,
} from "../types";
import {
  MOCK_ACCESSES,
  MOCK_AVAILABILITY,
  MOCK_BRAND_GIGABYTE_ID,
  MOCK_CAMPAIGNS,
  MOCK_CATEGORIES,
  MOCK_FAVORITES,
  MOCK_IMPORTS,
  MOCK_MATERIALS,
  MOCK_NEWS,
  MOCK_NOTIFICATIONS,
  MOCK_PENDING_INVITATIONS,
  MOCK_PRODUCTS,
  MOCK_TRAININGS,
} from "./data";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export const mockStore = {
  products: clone(MOCK_PRODUCTS),
  availability: clone(MOCK_AVAILABILITY),
  accesses: clone(MOCK_ACCESSES),
  pendingInvitations: clone(MOCK_PENDING_INVITATIONS),
  news: clone(MOCK_NEWS),
  campaigns: clone(MOCK_CAMPAIGNS),
  materials: clone(MOCK_MATERIALS),
  trainings: clone(MOCK_TRAININGS),
  favorites: clone(MOCK_FAVORITES),
  imports: clone(MOCK_IMPORTS),
  categories: clone(MOCK_CATEGORIES),
  notifications: clone(MOCK_NOTIFICATIONS),

  nextId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  },

  gigabyteProducts() {
    return this.products.filter((p) => p.brandId === MOCK_BRAND_GIGABYTE_ID);
  },

  updateAvailability(productId: string, distributorId: string, status: ProductAvailability["status"]) {
    const existing = this.availability.find(
      (a) => a.productId === productId && a.distributorId === distributorId
    );
    if (existing) {
      existing.status = status;
      existing.updatedAt = new Date().toISOString();
      return existing;
    }
    const dist = this.availability.find((a) => a.distributorId === distributorId);
    const created: ProductAvailability = {
      id: this.nextId("mock-av"),
      productId,
      distributorId,
      distributorName: dist?.distributorName ?? distributorId,
      status,
      updatedAt: new Date().toISOString(),
      tags: [],
    };
    this.availability.push(created);
    return created;
  },

  addProduct(input: Partial<BrandProduct> & { brandSku: string; model: string; commercialName: string }) {
    const p: BrandProduct = {
      ...input,
      id: this.nextId("mock-prod"),
      brandId: MOCK_BRAND_GIGABYTE_ID,
      imageUrls: input.imageUrls ?? [],
      active: input.active ?? true,
      discontinued: input.discontinued ?? false,
      isLaunch: input.isLaunch ?? false,
      recommended: input.recommended ?? false,
      featured: input.featured ?? false,
      hasReplacement: input.hasReplacement ?? false,
      tags: input.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.products.push(p);
    return p;
  },

  updateProduct(id: string, data: Partial<BrandProduct>) {
    const idx = this.products.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error("Producto no encontrado");
    this.products[idx] = { ...this.products[idx], ...data, updatedAt: new Date().toISOString() };
    return this.products[idx];
  },

  inviteUser(email: string): BrandAccess {
    const access: BrandAccess = {
      id: this.nextId("mock-access"),
      brandId: MOCK_BRAND_GIGABYTE_ID,
      userEmail: email,
      status: "INVITATION_SENT",
      invitedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      userTags: [],
      blockedByAdmin: false,
    };
    this.accesses.push(access);
    return access;
  },

  revokeAccess(accessId: string) {
    const a = this.accesses.find((x) => x.id === accessId);
    if (a) a.status = "REVOKED_BY_BRAND";
    return a;
  },

  acceptInvitation(accessId: string) {
    const inv = this.pendingInvitations.find((x) => x.id === accessId);
    if (inv) {
      inv.status = "ACTIVE";
      inv.acceptedAt = new Date().toISOString();
      this.accesses.push({ ...inv });
      this.pendingInvitations = this.pendingInvitations.filter((x) => x.id !== accessId);
      return inv;
    }
    throw new Error("Invitación no encontrada");
  },

  addNews(input: { title: string; description: string; type: BrandNews["type"]; status?: BrandNews["status"] }) {
    const n: BrandNews = {
      id: this.nextId("mock-news"),
      brandId: MOCK_BRAND_GIGABYTE_ID,
      title: input.title,
      description: input.description,
      type: input.type,
      relatedProductIds: [],
      relatedDistributorIds: [],
      publishedAt: input.status === "PUBLISHED" ? new Date().toISOString() : null,
      attachmentUrls: [],
      visibility: "ALL_AUTHORIZED",
      visibleUserIds: [],
      status: input.status ?? "DRAFT",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.news.unshift(n);
    return n;
  },

  addCampaign(input: Omit<BrandCampaign, "id" | "brandId" | "createdAt">) {
    const c: BrandCampaign = {
      ...input,
      id: this.nextId("mock-camp"),
      brandId: MOCK_BRAND_GIGABYTE_ID,
      createdAt: new Date().toISOString(),
    };
    this.campaigns.unshift(c);
    return c;
  },

  addMaterial(input: { title: string; type: BrandMaterial["type"]; description?: string }) {
    const m: BrandMaterial = {
      id: this.nextId("mock-mat"),
      brandId: MOCK_BRAND_GIGABYTE_ID,
      title: input.title,
      type: input.type,
      fileUrl: "#mock-upload",
      productIds: [],
      description: input.description,
      createdAt: new Date().toISOString(),
    };
    this.materials.unshift(m);
    return m;
  },

  addTraining(input: Omit<BrandTraining, "id" | "brandId" | "createdAt">) {
    const t: BrandTraining = {
      ...input,
      id: this.nextId("mock-train"),
      brandId: MOCK_BRAND_GIGABYTE_ID,
      createdAt: new Date().toISOString(),
    };
    this.trainings.unshift(t);
    return t;
  },

  addFavorite(brandId: string, productId: string) {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new Error("Producto no encontrado");
    const fav = {
      id: this.nextId("mock-fav"),
      userId: "mock-user",
      productId,
      brandId,
      product,
      createdAt: new Date().toISOString(),
    };
    this.favorites.push(fav);
    return fav;
  },

  removeFavorite(brandId: string, productId: string) {
    this.favorites = this.favorites.filter((f) => !(f.brandId === brandId && f.productId === productId));
  },

  markNotificationRead(id: string) {
    const n = this.notifications.find((x) => x.id === id);
    if (n) n.read = true;
    return n;
  },

  markAllNotificationsRead() {
    this.notifications.forEach((n) => { n.read = true; });
  },

  confirmImport(importId: string): ImportRecord {
    const rec: ImportRecord = {
      id: importId,
      brandId: MOCK_BRAND_GIGABYTE_ID,
      importedBy: "mock-brand-user",
      importedByName: "Admin Gigabyte (mock)",
      originalFileName: "import-mock.xlsx",
      importedAt: new Date().toISOString(),
      rowsProcessed: 12,
      productsCreated: 1,
      productsUpdated: 11,
      errorCount: 0,
      status: "COMPLETED",
      errors: [],
      canRevert: false,
    };
    this.imports.unshift(rec);
    return rec;
  },

  addCategory(name: string) {
    const c: Category = { id: this.nextId("mock-cat"), name, parentId: null, active: true };
    this.categories.push(c);
    return c;
  },
};
