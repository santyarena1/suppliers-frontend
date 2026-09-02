export const NEWS_KINDS = [
  "LAUNCH",
  "INCOMING",
  "PRICE_LIST",
  "PROMO",
  "CATALOG",
  "NOTICE",
  "OTHER",
] as const;

export type NewsKind = (typeof NEWS_KINDS)[number];

export const NEWS_KIND_LABELS: Record<NewsKind, string> = {
  LAUNCH: "Lanzamiento",
  INCOMING: "Próximo ingreso",
  PRICE_LIST: "Lista de precios",
  PROMO: "Promo",
  CATALOG: "Catálogo",
  NOTICE: "Aviso comercial",
  OTHER: "Nota",
};

export const NEWS_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type NewsStatus = (typeof NEWS_STATUSES)[number];

export const NEWS_ATTACHMENT_KINDS = ["PRICE_LIST", "FILE", "LINK", "RESOURCE"] as const;
export type NewsAttachmentKind = (typeof NEWS_ATTACHMENT_KINDS)[number];

export const NEWS_ATTACHMENT_VISIBILITIES = ["IN_APP", "PUBLIC"] as const;
export type NewsAttachmentVisibility = (typeof NEWS_ATTACHMENT_VISIBILITIES)[number];

export const NEWS_WRITERS_BY_TYPE = {
  DISTRIBUTOR: ["OWNER", "ADMIN", "PRODUCT_MANAGER"],
  BRAND: ["OWNER", "ADMIN", "MARKETING"],
} as const;

export type RelatedNewsSku = {
  provider: string;
  externalId: string;
  name: string;
};
