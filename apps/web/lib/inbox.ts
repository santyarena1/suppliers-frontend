import api from "@/lib/api";

/** Bandeja "Solicitudes" del superadmin y los formularios que la alimentan. */

export const INBOX_TYPES = ["SIGNUP", "NEW_STORE", "PAYMENT_NOTICE", "PLAN_REQUEST", "SUPPLIER_JOIN", "CONTACT"] as const;
export type InboxType = (typeof INBOX_TYPES)[number];
export type InboxStatus = "NEW" | "HANDLED" | "ARCHIVED";

export const INBOX_TYPE_LABELS: Record<InboxType, string> = {
  SIGNUP: "Usuario nuevo",
  NEW_STORE: "Comercio nuevo",
  PAYMENT_NOTICE: "Aviso de pago",
  PLAN_REQUEST: "Pedido de plan",
  SUPPLIER_JOIN: "Distribuidor o marca",
  CONTACT: "Consulta",
};

export const INBOX_STATUS_LABELS: Record<InboxStatus, string> = {
  NEW: "Pendientes",
  HANDLED: "Atendidas",
  ARCHIVED: "Archivadas",
};

export interface InboxItem {
  id: string;
  createdAt: string;
  type: InboxType;
  status: InboxStatus;
  title: string;
  message: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  company: string | null;
  tenantId: string | null;
  tenantName: string | null;
  userId: string | null;
  data: Record<string, string | number | boolean | null> | null;
  note: string | null;
  handledAt: string | null;
  emailedAt: string | null;
}

export interface InboxPage {
  items: InboxItem[];
  total: number;
  page: number;
  pageSize: number;
  pending: number;
  pendingByType: Record<InboxType, number>;
}

export type ContactKind = "CONTACT" | "CUSTOM" | "SUPPLIER" | "BRAND" | "PAYMENT";

export interface ContactPayload {
  kind?: ContactKind;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
}

export interface JoinRequestPayload {
  kind: "SUPPLIER" | "BRAND";
  company: string;
  phone?: string;
  website?: string;
  message?: string;
}

export const inboxApi = {
  list: (params: { status?: InboxStatus; type?: InboxType; page?: number }) =>
    api.get<InboxPage>("/admin/inbox", { params }),
  pending: () => api.get<{ pending: number }>("/admin/inbox/pending"),
  update: (id: string, body: { status?: InboxStatus; note?: string | null }) =>
    api.patch<InboxItem>(`/admin/inbox/${id}`, body),
};

export const contactApi = {
  send: (body: ContactPayload) => api.post<{ received: true }>("/contact", body),
  joinRequest: (body: JoinRequestPayload) => api.post<{ received: true }>("/my/join-request", body),
};
