export const INBOX_TYPES = ["SIGNUP", "NEW_STORE", "PAYMENT_NOTICE", "PLAN_REQUEST", "SUPPLIER_JOIN", "CONTACT"] as const;
export type InboxType = (typeof INBOX_TYPES)[number];

export const INBOX_STATUSES = ["NEW", "HANDLED", "ARCHIVED"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const INBOX_TYPE_LABELS: Record<InboxType, string> = {
  SIGNUP: "Usuario nuevo",
  NEW_STORE: "Comercio nuevo",
  PAYMENT_NOTICE: "Aviso de pago",
  PLAN_REQUEST: "Pedido de plan",
  SUPPLIER_JOIN: "Distribuidor o marca",
  CONTACT: "Consulta",
};

/** Lo que se carga en la bandeja. Los textos llegan ya validados por el DTO de origen. */
export interface InboxInput {
  type: InboxType;
  title: string;
  message?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  company?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  data?: Record<string, string | number | boolean | null | undefined> | null;
  /** false = queda en la bandeja sin mandar mail (el alta de usuario, que siempre sigue con el comercio). */
  notify?: boolean;
}
