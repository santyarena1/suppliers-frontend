import type {
  AccessStatus,
  ImportStatus,
  MaterialType,
  NewsType,
  NotificationType,
  PublicationStatus,
  StockStatus,
  TrainingType,
} from "./constants";

export type BrandRole = "ROLE_ADMIN" | "ROLE_BRAND" | "ROLE_USER";

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BrandAccount {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string | null;
  commercialData?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  active: boolean;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Distributor {
  id: string;
  name: string;
  code?: string | null;
  region?: string | null;
  active: boolean;
  createdAt: string;
}

export interface BrandDistributor {
  id: string;
  brandId: string;
  distributorId: string;
  distributor: Distributor;
  active: boolean;
  visibleToUsers: boolean;
  commercialNotes?: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string | null;
  active: boolean;
}

export interface BrandProduct {
  id: string;
  brandId: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  internalSku?: string | null;
  brandSku: string;
  model: string;
  commercialName: string;
  eanUpc?: string | null;
  shortDescription?: string | null;
  technicalDescription?: string | null;
  imageUrls: string[];
  datasheetUrl?: string | null;
  generalCommercialStatus?: string | null;
  active: boolean;
  discontinued: boolean;
  isLaunch: boolean;
  recommended: boolean;
  featured: boolean;
  hasReplacement: boolean;
  replacementProductId?: string | null;
  replacementProductName?: string | null;
  internalNotes?: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductAvailability {
  id: string;
  productId: string;
  distributorId: string;
  distributorName: string;
  status: StockStatus;
  estimatedQuantity?: number | null;
  estimatedArrivalDate?: string | null;
  notes?: string | null;
  suggestedPrice?: number | null;
  commercialAction?: string | null;
  replacementSuggested?: string | null;
  commercialPriority?: number | null;
  tags: string[];
  updatedAt: string;
  updatedBy?: string | null;
}

export interface BrandAccess {
  id: string;
  brandId: string;
  brandName?: string;
  brandLogoUrl?: string | null;
  userId?: string | null;
  userEmail: string;
  userName?: string | null;
  status: AccessStatus;
  invitedAt: string;
  acceptedAt?: string | null;
  lastActivityAt?: string | null;
  expiresAt?: string | null;
  userGroup?: string | null;
  userTags: string[];
  blockedByAdmin: boolean;
}

export interface BrandNews {
  id: string;
  brandId: string;
  title: string;
  description: string;
  type: NewsType;
  relatedProductIds: string[];
  relatedDistributorIds: string[];
  publishedAt?: string | null;
  expiresAt?: string | null;
  featuredImageUrl?: string | null;
  attachmentUrls: string[];
  visibility: "ALL_AUTHORIZED" | "SPECIFIC_USERS";
  visibleUserIds: string[];
  status: PublicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BrandCampaign {
  id: string;
  brandId: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  productIds: string[];
  distributorIds: string[];
  commercialConditions?: string | null;
  attachmentUrls: string[];
  visibleUserIds: string[];
  status: "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
  createdAt: string;
}

export interface BrandMaterial {
  id: string;
  brandId: string;
  title: string;
  type: MaterialType;
  fileUrl: string;
  productIds: string[];
  description?: string | null;
  createdAt: string;
}

export interface BrandTraining {
  id: string;
  brandId: string;
  title: string;
  type: TrainingType;
  contentUrl: string;
  productIds: string[];
  description?: string | null;
  createdAt: string;
}

export interface BrandFavorite {
  id: string;
  userId: string;
  productId: string;
  brandId: string;
  product: BrandProduct;
  createdAt: string;
}

export interface BrandNotification {
  id: string;
  userId: string;
  brandId?: string | null;
  brandName?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  relatedProductId?: string | null;
  relatedEntityId?: string | null;
  createdAt: string;
}

export interface ImportRecord {
  id: string;
  brandId: string;
  importedBy: string;
  importedByName?: string | null;
  originalFileName: string;
  importedAt: string;
  rowsProcessed: number;
  productsCreated: number;
  productsUpdated: number;
  errorCount: number;
  status: ImportStatus;
  errors: ImportRowError[];
  canRevert: boolean;
}

export interface ImportRowError {
  row: number;
  column?: string | null;
  message: string;
}

export interface ImportPreview {
  importId: string;
  validRows: number;
  invalidRows: number;
  preview: ImportPreviewRow[];
  errors: ImportRowError[];
}

export interface ImportPreviewRow {
  row: number;
  action: "CREATE" | "UPDATE";
  sku: string;
  commercialName: string;
  distributor: string;
  status: string;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string;
  performedByName?: string | null;
  brandId?: string | null;
  changes?: Record<string, unknown> | null;
  createdAt: string;
}

export interface BrandDashboardStats {
  productCount: number;
  activeDistributors: number;
  authorizedUsers: number;
  pendingInvitations: number;
  lastAvailabilityUpdate?: string | null;
  criticalStockCount: number;
  outOfStockCount: number;
  incomingCount: number;
  discontinuedCount: number;
  activeLaunches: number;
  activeCampaigns: number;
  materialsCount: number;
  alerts: { type: string; message: string }[];
}

export interface UserBrandDashboard {
  authorizedBrands: BrandAccess[];
  recentAlerts: BrandNotification[];
  upcomingIncoming: BrandNews[];
  favoriteChanges: { product: BrandProduct; oldStatus?: StockStatus; newStatus: StockStatus }[];
  activeCampaigns: BrandCampaign[];
  recentNews: BrandNews[];
  newMaterials: BrandMaterial[];
  importantDiscontinued: BrandProduct[];
  unreadNotifications: number;
}

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  subcategoryId?: string;
  discontinued?: boolean;
  recommended?: boolean;
  isLaunch?: boolean;
  featured?: boolean;
  tag?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AvailabilityFilters {
  search?: string;
  distributorId?: string;
  categoryId?: string;
  status?: StockStatus;
  tag?: string;
}

export interface NewsFilters {
  brandId?: string;
  type?: NewsType;
  page?: number;
  pageSize?: number;
}

export interface BrandProductInput {
  categoryId?: string;
  subcategoryId?: string;
  internalSku?: string;
  brandSku: string;
  model: string;
  commercialName: string;
  eanUpc?: string;
  shortDescription?: string;
  technicalDescription?: string;
  generalCommercialStatus?: string;
  active?: boolean;
  discontinued?: boolean;
  isLaunch?: boolean;
  recommended?: boolean;
  featured?: boolean;
  replacementProductId?: string;
  internalNotes?: string;
  tags?: string[];
}

export interface AvailabilityInput {
  productId: string;
  distributorId: string;
  status: StockStatus;
  estimatedQuantity?: number;
  estimatedArrivalDate?: string;
  notes?: string;
  suggestedPrice?: number;
  commercialAction?: string;
  replacementSuggested?: string;
  commercialPriority?: number;
  tags?: string[];
}

export interface InviteUserInput {
  email: string;
  requireAcceptance?: boolean;
  userGroup?: string;
  userTags?: string[];
}

export interface BrandNewsInput {
  title: string;
  description: string;
  type: NewsType;
  relatedProductIds?: string[];
  relatedDistributorIds?: string[];
  expiresAt?: string;
  featuredImageUrl?: string;
  visibility?: "ALL_AUTHORIZED" | "SPECIFIC_USERS";
  visibleUserIds?: string[];
  status?: PublicationStatus;
}

export interface BrandProfileInput {
  name?: string;
  description?: string;
  commercialData?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  logoUrl?: string;
}

export interface AdminBrandInput {
  name: string;
  slug?: string;
  contactEmail: string;
  adminUsername: string;
  adminPassword: string;
  description?: string;
}

export interface AdminDistributorInput {
  name: string;
  code?: string;
  region?: string;
}
