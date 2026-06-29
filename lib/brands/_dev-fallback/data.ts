import type {
  AuditLogEntry,
  BrandAccess,
  BrandAccount,
  BrandCampaign,
  BrandDashboardStats,
  BrandDistributor,
  BrandFavorite,
  BrandMaterial,
  BrandNews,
  BrandNotification,
  BrandProduct,
  BrandTraining,
  Category,
  Distributor,
  ImportPreview,
  ImportRecord,
  ProductAvailability,
  UserBrandDashboard,
} from "../types";

const NOW = new Date().toISOString();
const DAYS = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

export const MOCK_BRAND_GIGABYTE_ID = "mock-brand-gigabyte";
export const MOCK_BRAND_MSI_ID = "mock-brand-msi";

export const MOCK_DISTRIBUTORS: Distributor[] = [
  { id: "mock-dist-elit", name: "ELIT", code: "ELIT", region: "AMBA", active: true, createdAt: NOW },
  { id: "mock-dist-invid", name: "INVID", code: "INVID", region: "Nacional", active: true, createdAt: NOW },
  { id: "mock-dist-nb", name: "NEW_BYTES", code: "NB", region: "AMBA", active: true, createdAt: NOW },
];

export const MOCK_BRANDS: BrandAccount[] = [
  {
    id: MOCK_BRAND_GIGABYTE_ID,
    name: "Gigabyte",
    slug: "gigabyte",
    logoUrl: null,
    description: "Líder en motherboards, placas de video y periféricos para gaming y estaciones de trabajo.",
    commercialData: "Condiciones comerciales Q2 2026 disponibles con tu representante.",
    contactEmail: "argentina@gigabyte.com",
    contactPhone: "+54 11 4000-0000",
    website: "https://www.gigabyte.com",
    active: true,
    suspended: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: MOCK_BRAND_MSI_ID,
    name: "MSI",
    slug: "msi",
    logoUrl: null,
    description: "Componentes gaming, notebooks y monitores. Información comercial para revendedores autorizados.",
    contactEmail: "ventas@msi.com.ar",
    contactPhone: "+54 11 5000-0000",
    website: "https://www.msi.com",
    active: true,
    suspended: false,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

export const MOCK_PRODUCTS: BrandProduct[] = [
  {
    id: "mock-prod-1",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    categoryName: "Motherboards",
    subcategoryName: "AMD AM4",
    brandSku: "GB-B550M-DS3H",
    model: "B550M DS3H",
    commercialName: "Motherboard Gigabyte B550M DS3H",
    eanUpc: "4719331848123",
    shortDescription: "Micro-ATX, PCIe 4.0, ideal armados económicos Ryzen.",
    imageUrls: [],
    active: true,
    discontinued: false,
    isLaunch: false,
    recommended: true,
    featured: false,
    hasReplacement: false,
    tags: ["gaming", "economico"],
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "mock-prod-2",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    categoryName: "Placas de video",
    subcategoryName: "NVIDIA",
    brandSku: "GV-N5070WF3OC-12GD",
    model: "RTX 5070 WINDFORCE OC 12G",
    commercialName: "Placa de Video Gigabyte RTX 5070 WINDFORCE OC 12GB",
    shortDescription: "Lanzamiento 2026 — alta demanda gaming.",
    imageUrls: [],
    active: true,
    discontinued: false,
    isLaunch: true,
    recommended: true,
    featured: true,
    hasReplacement: false,
    tags: ["gaming", "alta-gama", "lanzamiento"],
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "mock-prod-3",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    categoryName: "Motherboards",
    subcategoryName: "AMD AM4",
    brandSku: "GB-B450M-DS3H-V2",
    model: "B450M DS3H V2",
    commercialName: "Motherboard Gigabyte B450M DS3H V2",
    shortDescription: "Discontinuado — reemplazo: B550M DS3H.",
    imageUrls: [],
    active: true,
    discontinued: true,
    isLaunch: false,
    recommended: false,
    featured: false,
    hasReplacement: true,
    replacementProductId: "mock-prod-1",
    replacementProductName: "Motherboard Gigabyte B550M DS3H",
    tags: ["discontinuado"],
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "mock-prod-4",
    brandId: MOCK_BRAND_MSI_ID,
    categoryName: "Monitores",
    subcategoryName: "Gaming",
    brandSku: "MAG-274UPF",
    model: "MAG 274UPF",
    commercialName: "Monitor MSI MAG 274UPF 27\" 4K 160Hz",
    imageUrls: [],
    active: true,
    discontinued: false,
    isLaunch: false,
    recommended: true,
    featured: false,
    hasReplacement: false,
    tags: ["gaming", "oficina"],
    createdAt: NOW,
    updatedAt: NOW,
  },
];

export const MOCK_AVAILABILITY: ProductAvailability[] = [
  { id: "mock-av-1", productId: "mock-prod-1", distributorId: "mock-dist-elit", distributorName: "ELIT", status: "HIGH_STOCK", estimatedQuantity: 120, updatedAt: NOW, tags: [] },
  { id: "mock-av-2", productId: "mock-prod-1", distributorId: "mock-dist-invid", distributorName: "INVID", status: "LOW_STOCK", estimatedQuantity: 8, updatedAt: NOW, tags: [] },
  { id: "mock-av-3", productId: "mock-prod-1", distributorId: "mock-dist-nb", distributorName: "NEW_BYTES", status: "OUT_OF_STOCK", updatedAt: NOW, tags: [] },
  { id: "mock-av-4", productId: "mock-prod-2", distributorId: "mock-dist-elit", distributorName: "ELIT", status: "PRE_SALE", estimatedArrivalDate: DAYS(14), notes: "Reservar con anticipación", updatedAt: NOW, tags: [] },
  { id: "mock-av-5", productId: "mock-prod-2", distributorId: "mock-dist-invid", distributorName: "INVID", status: "INCOMING", estimatedArrivalDate: DAYS(7), estimatedQuantity: 40, updatedAt: NOW, tags: [] },
  { id: "mock-av-6", productId: "mock-prod-2", distributorId: "mock-dist-nb", distributorName: "NEW_BYTES", status: "CONSULT", notes: "Consultar al representante", updatedAt: NOW, tags: [] },
  { id: "mock-av-7", productId: "mock-prod-3", distributorId: "mock-dist-elit", distributorName: "ELIT", status: "DISCONTINUED", replacementSuggested: "B550M DS3H", notes: "Stock remanente: ~15 u.", updatedAt: NOW, tags: [] },
  { id: "mock-av-8", productId: "mock-prod-4", distributorId: "mock-dist-invid", distributorName: "INVID", status: "MEDIUM_STOCK", estimatedQuantity: 25, updatedAt: NOW, tags: [] },
];

export const MOCK_BRAND_DISTRIBUTORS: BrandDistributor[] = MOCK_DISTRIBUTORS.map((d, i) => ({
  id: `mock-bd-${i}`,
  brandId: MOCK_BRAND_GIGABYTE_ID,
  distributorId: d.id,
  distributor: d,
  active: true,
  visibleToUsers: true,
  commercialNotes: i === 0 ? "Canal preferido para motherboards" : null,
  createdAt: NOW,
}));

export const MOCK_ACCESSES: BrandAccess[] = [
  {
    id: "mock-access-1",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    brandName: "Gigabyte",
    userEmail: "demo@casacomputacion.com",
    status: "ACTIVE",
    invitedAt: DAYS(-30),
    acceptedAt: DAYS(-28),
    lastActivityAt: DAYS(-1),
    userTags: [],
    blockedByAdmin: false,
  },
  {
    id: "mock-access-2",
    brandId: MOCK_BRAND_MSI_ID,
    brandName: "MSI",
    userEmail: "demo@casacomputacion.com",
    status: "ACTIVE",
    invitedAt: DAYS(-20),
    acceptedAt: DAYS(-18),
    userTags: [],
    blockedByAdmin: false,
  },
  {
    id: "mock-access-pending",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    brandName: "Gigabyte",
    userEmail: "otra@casacomputacion.com",
    status: "INVITATION_SENT",
    invitedAt: DAYS(-3),
    expiresAt: DAYS(27),
    userTags: [],
    blockedByAdmin: false,
  },
];

export const MOCK_PENDING_INVITATIONS: BrandAccess[] = [
  {
    id: "mock-invite-user",
    brandId: MOCK_BRAND_MSI_ID,
    brandName: "MSI",
    userEmail: "demo@casacomputacion.com",
    status: "INVITATION_SENT",
    invitedAt: DAYS(-2),
    expiresAt: DAYS(28),
    userTags: [],
    blockedByAdmin: false,
  },
];

export const MOCK_NEWS: BrandNews[] = [
  {
    id: "mock-news-1",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    title: "Próximo ingreso RTX 5070 — semana del 15/07",
    description: "Llegada confirmada a ELIT e INVID. Cantidades limitadas, se recomienda reservar.",
    type: "INCOMING",
    relatedProductIds: ["mock-prod-2"],
    relatedDistributorIds: ["mock-dist-elit", "mock-dist-invid"],
    publishedAt: DAYS(-1),
    attachmentUrls: [],
    visibility: "ALL_AUTHORIZED",
    visibleUserIds: [],
    status: "PUBLISHED",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "mock-news-2",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    title: "B450M DS3H V2 discontinuado",
    description: "Dejar de cotizar. Reemplazo oficial: B550M DS3H. Stock remanente solo en ELIT.",
    type: "DISCONTINUED",
    relatedProductIds: ["mock-prod-3"],
    relatedDistributorIds: ["mock-dist-elit"],
    publishedAt: DAYS(-5),
    attachmentUrls: [],
    visibility: "ALL_AUTHORIZED",
    visibleUserIds: [],
    status: "PUBLISHED",
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: "mock-news-3",
    brandId: MOCK_BRAND_MSI_ID,
    title: "Campaña monitores gaming Q2",
    description: "Bonificación por volumen en línea MAG. Consultar condiciones con tu ejecutivo.",
    type: "COMMERCIAL_NOTICE",
    relatedProductIds: ["mock-prod-4"],
    relatedDistributorIds: [],
    publishedAt: DAYS(-2),
    attachmentUrls: [],
    visibility: "ALL_AUTHORIZED",
    visibleUserIds: [],
    status: "PUBLISHED",
    createdAt: NOW,
    updatedAt: NOW,
  },
];

export const MOCK_CAMPAIGNS: BrandCampaign[] = [
  {
    id: "mock-camp-1",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    name: "Impulso Gaming Q2 2026",
    description: "Bundles motherboard + GPU con condiciones especiales en ELIT.",
    startDate: DAYS(-10),
    endDate: DAYS(50),
    productIds: ["mock-prod-1", "mock-prod-2"],
    distributorIds: ["mock-dist-elit"],
    commercialConditions: "10% adicional sobre lista al combinar B550 + RTX 5070",
    attachmentUrls: [],
    visibleUserIds: [],
    status: "ACTIVE",
    createdAt: NOW,
  },
];

export const MOCK_MATERIALS: BrandMaterial[] = [
  {
    id: "mock-mat-1",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    title: "Catálogo Motherboards AMD 2026",
    type: "CATALOG",
    fileUrl: "#mock-catalog",
    productIds: ["mock-prod-1"],
    description: "PDF catálogo completo",
    createdAt: DAYS(-7),
  },
  {
    id: "mock-mat-2",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    title: "Ficha técnica RTX 5070 WINDFORCE",
    type: "DATASHEET",
    fileUrl: "#mock-datasheet",
    productIds: ["mock-prod-2"],
    createdAt: DAYS(-3),
  },
];

export const MOCK_TRAININGS: BrandTraining[] = [
  {
    id: "mock-train-1",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    title: "Cómo vender B550M DS3H vs competencia",
    type: "VIDEO",
    contentUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    productIds: ["mock-prod-1"],
    description: "Argumentos de venta para vendedores de mostrador",
    createdAt: DAYS(-14),
  },
];

export const MOCK_NOTIFICATIONS: BrandNotification[] = [
  {
    id: "mock-notif-1",
    userId: "mock-user",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    brandName: "Gigabyte",
    type: "NEW_INCOMING",
    title: "Próximo ingreso RTX 5070",
    message: "ELIT confirma ingreso estimado para el 15/07.",
    read: false,
    relatedProductId: "mock-prod-2",
    createdAt: DAYS(-1),
  },
  {
    id: "mock-notif-2",
    userId: "mock-user",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    brandName: "Gigabyte",
    type: "FAVORITE_STATUS_CHANGE",
    title: "B550M DS3H cambió de estado en INVID",
    message: "Pasó de Stock medio a Bajo stock.",
    read: false,
    relatedProductId: "mock-prod-1",
    createdAt: DAYS(-0.5),
  },
  {
    id: "mock-notif-3",
    userId: "mock-user",
    brandId: MOCK_BRAND_MSI_ID,
    brandName: "MSI",
    type: "NEW_CAMPAIGN",
    title: "Nueva campaña monitores gaming",
    message: "Revisá las condiciones comerciales vigentes.",
    read: true,
    createdAt: DAYS(-2),
  },
];

export const MOCK_FAVORITES: BrandFavorite[] = [
  {
    id: "mock-fav-1",
    userId: "mock-user",
    productId: "mock-prod-1",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    product: MOCK_PRODUCTS[0],
    createdAt: DAYS(-10),
  },
  {
    id: "mock-fav-2",
    userId: "mock-user",
    productId: "mock-prod-2",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    product: MOCK_PRODUCTS[1],
    createdAt: DAYS(-5),
  },
];

export const MOCK_IMPORTS: ImportRecord[] = [
  {
    id: "mock-import-1",
    brandId: MOCK_BRAND_GIGABYTE_ID,
    importedBy: "mock-brand-user",
    importedByName: "admin@gigabyte.com",
    originalFileName: "disponibilidad-junio-2026.xlsx",
    importedAt: DAYS(-3),
    rowsProcessed: 48,
    productsCreated: 2,
    productsUpdated: 46,
    errorCount: 0,
    status: "COMPLETED",
    errors: [],
    canRevert: true,
  },
];

export const MOCK_CATEGORIES: Category[] = [
  { id: "mock-cat-1", name: "Motherboards", parentId: null, active: true },
  { id: "mock-cat-2", name: "Placas de video", parentId: null, active: true },
  { id: "mock-cat-3", name: "Monitores", parentId: null, active: true },
  { id: "mock-cat-4", name: "AMD AM4", parentId: "mock-cat-1", active: true },
];

export const MOCK_AUDIT: AuditLogEntry[] = [
  { id: "mock-audit-1", entityType: "AVAILABILITY", entityId: "mock-av-2", action: "UPDATE", performedBy: "brand-admin", performedByName: "Admin Gigabyte", brandId: MOCK_BRAND_GIGABYTE_ID, createdAt: DAYS(-1) },
  { id: "mock-audit-2", entityType: "PRODUCT", entityId: "mock-prod-2", action: "CREATE", performedBy: "brand-admin", performedByName: "Admin Gigabyte", brandId: MOCK_BRAND_GIGABYTE_ID, createdAt: DAYS(-7) },
  { id: "mock-audit-3", entityType: "ACCESS", entityId: "mock-access-1", action: "INVITE", performedBy: "brand-admin", performedByName: "Admin Gigabyte", brandId: MOCK_BRAND_GIGABYTE_ID, createdAt: DAYS(-30) },
];

export const MOCK_DASHBOARD_STATS: BrandDashboardStats = {
  productCount: MOCK_PRODUCTS.filter((p) => p.brandId === MOCK_BRAND_GIGABYTE_ID).length,
  activeDistributors: 3,
  authorizedUsers: 2,
  pendingInvitations: 1,
  lastAvailabilityUpdate: DAYS(-1),
  criticalStockCount: 0,
  outOfStockCount: 1,
  incomingCount: 2,
  discontinuedCount: 1,
  activeLaunches: 1,
  activeCampaigns: 1,
  materialsCount: 2,
  alerts: [{ type: "STOCK", message: "RTX 5070: alta demanda, considerar reservas en preventa." }],
};

export const MOCK_USER_DASHBOARD: UserBrandDashboard = {
  authorizedBrands: MOCK_ACCESSES.filter((a) => a.status === "ACTIVE"),
  recentAlerts: MOCK_NOTIFICATIONS.filter((n) => !n.read),
  upcomingIncoming: MOCK_NEWS.filter((n) => n.type === "INCOMING"),
  favoriteChanges: [{ product: MOCK_PRODUCTS[0], oldStatus: "MEDIUM_STOCK", newStatus: "LOW_STOCK" }],
  activeCampaigns: MOCK_CAMPAIGNS,
  recentNews: MOCK_NEWS,
  newMaterials: MOCK_MATERIALS,
  importantDiscontinued: [MOCK_PRODUCTS[2]],
  unreadNotifications: MOCK_NOTIFICATIONS.filter((n) => !n.read).length,
};

export const MOCK_ADMIN_METRICS: Record<string, number> = {
  brandCount: 2,
  distributorCount: 3,
  activeAccessCount: 2,
  importsLast30Days: 1,
  productCount: 4,
  pendingInvitations: 2,
  blockedAccessCount: 0,
  usersWithBrands: 1,
};

export function mockImportPreview(): ImportPreview {
  return {
    importId: `mock-preview-${Date.now()}`,
    validRows: 12,
    invalidRows: 2,
    preview: [
      { row: 2, action: "UPDATE", sku: "GB-B550M-DS3H", commercialName: "Motherboard Gigabyte B550M DS3H", distributor: "ELIT", status: "HIGH_STOCK" },
      { row: 3, action: "CREATE", sku: "GB-X670-UD", commercialName: "Motherboard Gigabyte X670 UD", distributor: "INVID", status: "INCOMING" },
    ],
    errors: [
      { row: 5, column: "distribuidor", message: "Distribuidor 'XYZ' no encontrado" },
      { row: 8, column: "estado_stock", message: "Estado 'SUPER_STOCK' no válido" },
    ],
  };
}

export function mockPaginated<T>(items: T[], page = 1, pageSize = 100) {
  return { items, total: items.length, page, pageSize };
}
