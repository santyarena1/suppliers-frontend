/**
 * Planes de NODO para comercios (Tipo 1). Espejo de `packages/shared/src/plans.ts`:
 * la web no depende del paquete compartido, así que los precios y nombres se
 * repiten acá. El backend es la fuente de verdad de lo que cada plan puede hacer;
 * esto solo arma la pantalla. Ver docs/PLAN_SUSCRIPCIONES.md.
 */

export type TenantPlan = "BASE" | "PRO" | "CUSTOM";

export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "GRACE_PERIOD" | "SUSPENDED" | "COURTESY" | "CANCELLED";
export type SubscriptionAccess = "FULL" | "RESTRICTED";
export type SetupFeeStatus = "NOT_APPLICABLE" | "PENDING" | "PAID" | "WAIVED";
export type SubscriptionPaymentProvider = "MANUAL" | "TRANSFER" | "COURTESY" | "MERCADOPAGO" | "STRIPE" | "OTHER";

export type PlanCapabilityKey =
  | "directCheckout"
  | "providerPortalAccess"
  | "providerAccountAccess"
  | "integratedChat"
  | "advancedAnalytics"
  | "externalIntegrations"
  | "customModules"
  | "customBranding"
  /** Modo vendedor: márgenes de venta y precio de venta para el rol Vendedor (Pro y Custom). */
  | "sellerMode";

export type PlanCapabilities = Record<PlanCapabilityKey, boolean> & { maxSearchProviders: number | null };

export interface PlanDefinition {
  plan: TenantPlan;
  label: string;
  shortLabel: string;
  monthlyPrice: number;
  currency: "USD";
  setupFee: number | null;
  tagline: string;
}

export const PLAN_CATALOG: Record<TenantPlan, PlanDefinition> = {
  BASE: {
    plan: "BASE",
    label: "NODO Base",
    shortLabel: "Base",
    monthlyPrice: 35,
    currency: "USD",
    setupFee: null,
    tagline: "Centralizá y prepará tus compras.",
  },
  PRO: {
    plan: "PRO",
    label: "NODO Pro",
    shortLabel: "Pro",
    monthlyPrice: 45,
    currency: "USD",
    setupFee: null,
    tagline: "Gestioná tus compras y proveedores directamente desde NODO.",
  },
  CUSTOM: {
    plan: "CUSTOM",
    label: "NODO Custom",
    shortLabel: "Custom",
    monthlyPrice: 100,
    currency: "USD",
    setupFee: 300,
    tagline: "NODO adaptado a tu empresa.",
  },
};

export const BASE_SEARCH_LIMIT = 5;

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIAL: "Prueba",
  ACTIVE: "Activa",
  PAST_DUE: "Vencida",
  GRACE_PERIOD: "En gracia",
  SUSPENDED: "Suspendida",
  COURTESY: "Cortesía",
  CANCELLED: "Cancelada",
};

export const SETUP_FEE_STATUS_LABELS: Record<SetupFeeStatus, string> = {
  NOT_APPLICABLE: "No aplica",
  PENDING: "Pendiente",
  PAID: "Pagado",
  WAIVED: "Exento",
};

export const PAYMENT_PROVIDER_LABELS: Record<SubscriptionPaymentProvider, string> = {
  MANUAL: "Manual",
  TRANSFER: "Transferencia",
  COURTESY: "Cortesía",
  MERCADOPAGO: "Mercado Pago",
  STRIPE: "Stripe",
  OTHER: "Otro",
};

export const PLAN_UPSELL: Record<PlanCapabilityKey, string> = {
  directCheckout: "Con NODO Pro podés enviar este pedido directamente al distribuidor.",
  providerPortalAccess: "La integración con los portales de los distribuidores está disponible en NODO Pro.",
  providerAccountAccess: "La cuenta corriente integrada está disponible en NODO Pro.",
  integratedChat: "El chat comercial con tus distribuidores está disponible en NODO Pro.",
  advancedAnalytics: "Los analytics avanzados de compras están disponibles en NODO Pro.",
  externalIntegrations: "Las integraciones con ERP, CRM y sistemas externos están disponibles en NODO Custom.",
  customModules: "Los módulos personalizados están disponibles en NODO Custom.",
  customBranding: "La identidad visual adaptada está disponible en NODO Custom.",
  sellerMode: "El modo vendedor, con márgenes de venta por categoría y producto, está disponible en NODO Pro.",
};

export function searchLimitMessage(max = BASE_SEARCH_LIMIT): string {
  return `Tu plan Base permite buscar simultáneamente en hasta ${max} distribuidores. Desactivá uno de los actuales o pasá a NODO Pro para buscar en todos.`;
}

export function formatUsd(amount: number): string {
  return `USD ${amount.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

// ---------- Respuestas del backend ----------

export interface SearchUsage {
  connectedProviders: number;
  activeSearchProviders: number;
  maxSearchProviders: number | null;
}

export interface SubscriptionView {
  tenantId: string;
  tenantName: string;
  plan: TenantPlan;
  planLabel: string;
  price: number;
  listPrice: number;
  priceOverridden: boolean;
  currency: string;
  status: SubscriptionStatus;
  statusLabel: string;
  access: SubscriptionAccess;
  startedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  dueAt: string | null;
  suspendsAt: string | null;
  daysUntilDue: number | null;
  daysOverdue: number | null;
  trialEndsAt: string | null;
  cancelledAt: string | null;
  setupFee: { amount: number | null; status: SetupFeeStatus; statusLabel: string; paidAt: string | null; blocksCustom: boolean };
  capabilities: PlanCapabilities;
}

export interface SubscriptionPaymentRow {
  id: string;
  kind: "SUBSCRIPTION" | "SETUP_FEE";
  plan: TenantPlan | null;
  planLabel?: string | null;
  amount: number;
  currency: string;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  provider: SubscriptionPaymentProvider;
  providerLabel: string;
}

export interface MySubscription extends SubscriptionView {
  usage: SearchUsage;
  canManage: boolean;
  payments: SubscriptionPaymentRow[];
}

export type AdminSubscriptionFilter = "all" | "active" | "upcoming" | "past_due" | "grace" | "suspended" | "courtesy" | "cancelled";

export const ADMIN_SUBSCRIPTION_FILTERS: { key: AdminSubscriptionFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "active", label: "Activas" },
  { key: "upcoming", label: "Próximas a vencer" },
  { key: "past_due", label: "Vencidas" },
  { key: "grace", label: "En gracia" },
  { key: "suspended", label: "Suspendidas" },
  { key: "courtesy", label: "Cortesía" },
  { key: "cancelled", label: "Canceladas" },
];

export interface AdminSubscriptionRow extends SubscriptionView {
  storedStatus: SubscriptionStatus;
  courtesy: { active: boolean; until: string | null; reason: string | null };
  suspensionReason: string | null;
  cancellationReason: string | null;
  notes: string | null;
  gracePeriodEnd: string | null;
  lastPayment: { amount: number; paidAt: string | null; provider: string } | null;
  pendingRequest: { plan: TenantPlan | null; at: string; message: string | null } | null;
  paymentNoticeAt: string | null;
  tenantActive: boolean;
  createdAt: string;
}

export interface AdminSubscriptionDetail extends AdminSubscriptionRow {
  usage: SearchUsage;
  payments: (SubscriptionPaymentRow & {
    status: string;
    externalReference: string | null;
    notes: string | null;
    recordedBy: string | null;
    createdAt: string;
  })[];
  events: {
    id: string;
    type: string;
    fromStatus: SubscriptionStatus | null;
    toStatus: SubscriptionStatus | null;
    fromPlan: TenantPlan | null;
    toPlan: TenantPlan | null;
    actor: string | null;
    data: Record<string, unknown> | null;
    createdAt: string;
  }[];
  reminders: { id: string; kind: string; channel: string; status: string; anchorAt: string; sentAt: string | null }[];
}

/** Error de plan que devuelve el backend (`code` en el envelope). */
export interface PlanError {
  code: "PLAN_FEATURE_UNAVAILABLE" | "PLAN_SEARCH_LIMIT" | "SUBSCRIPTION_SUSPENDED";
  message: string;
  details?: Record<string, unknown>;
}

const PLAN_ERROR_CODES = new Set(["PLAN_FEATURE_UNAVAILABLE", "PLAN_SEARCH_LIMIT", "SUBSCRIPTION_SUSPENDED"]);

export function planErrorOf(err: unknown): PlanError | null {
  const data = (err as { response?: { data?: { code?: string; message?: string; details?: Record<string, unknown> } } })?.response?.data;
  if (!data?.code || !PLAN_ERROR_CODES.has(data.code)) return null;
  return { code: data.code as PlanError["code"], message: data.message ?? "", details: data.details };
}

// ---------- Comparador (landing y Plan y facturación) ----------

/** `true` = incluido, `false` = no, string = detalle. */
export type PlanCell = boolean | string;

export interface PlanFeatureGroup {
  title: string;
  rows: { label: string; values: Record<TenantPlan, PlanCell> }[];
}

const all = (value: PlanCell): Record<TenantPlan, PlanCell> => ({ BASE: value, PRO: value, CUSTOM: value });
const fromPro = (): Record<TenantPlan, PlanCell> => ({ BASE: false, PRO: true, CUSTOM: true });
const customOnly = (value: PlanCell = true): Record<TenantPlan, PlanCell> => ({ BASE: false, PRO: false, CUSTOM: value });

export const PLAN_FEATURE_GROUPS: PlanFeatureGroup[] = [
  {
    title: "Búsqueda y catálogo",
    rows: [
      { label: "Distribuidores conectados", values: all("Ilimitados") },
      { label: "Distribuidores activos en búsqueda", values: { BASE: `Hasta ${BASE_SEARCH_LIMIT} a la vez`, PRO: "Todos", CUSTOM: "Todos" } },
      { label: "Buscador unificado y comparación de precios", values: all(true) },
      { label: "Ficha de producto, catálogo y favoritos", values: all(true) },
      { label: "Carga de listas de precios", values: all(true) },
    ],
  },
  {
    title: "Operación de compra",
    rows: [
      { label: "Carrito multi-proveedor", values: all(true) },
      { label: "Generar pedido, copiarlo o enviarlo por WhatsApp", values: all(true) },
      { label: "Checkout directo al distribuidor", values: fromPro() },
      { label: "Formas de pago y percepciones del proveedor", values: fromPro() },
    ],
  },
  {
    title: "Pedidos",
    rows: [
      { label: "Historial de pedidos", values: { BASE: "Básico", PRO: "Avanzado", CUSTOM: "Avanzado" } },
      { label: "Aprobación de pedidos del equipo", values: all(true) },
    ],
  },
  {
    title: "Modo vendedor y presupuestos",
    rows: [
      { label: "Márgenes de venta por distribuidor, categoría y producto", values: fromPro() },
      { label: "Vendedores que ven solo el precio de venta", values: fromPro() },
      { label: "Presupuestos para clientes (WhatsApp, impresión, pasar a compra)", values: fromPro() },
    ],
  },
  {
    title: "Portales de proveedores",
    rows: [{ label: "Integración con portales y APIs", values: fromPro() }],
  },
  {
    title: "Cuenta corriente y documentos",
    rows: [
      { label: "Cuenta corriente integrada", values: fromPro() },
      { label: "Facturas y comprobantes", values: fromPro() },
    ],
  },
  {
    title: "Analytics",
    rows: [
      { label: "Resumen de compras", values: all(true) },
      { label: "Analytics avanzados y automatizaciones", values: fromPro() },
    ],
  },
  {
    title: "Chat",
    rows: [{ label: "Chat comercial con distribuidores", values: fromPro() }],
  },
  {
    title: "API de catálogo",
    rows: [
      {
        label: "Tu catálogo en tu tienda, ERP, Google y Meta (API, webhooks y feeds)",
        values: { BASE: "+US$ 10/mes", PRO: "+US$ 10/mes", CUSTOM: "Incluida" },
      },
    ],
  },
  {
    title: "ERP / CRM",
    rows: [{ label: "Integraciones con sistemas externos", values: customOnly() }],
  },
  {
    title: "Módulos personalizados",
    rows: [{ label: "Flujos y módulos diseñados para tu operación", values: customOnly() }],
  },
  {
    title: "Personalización",
    rows: [{ label: "Identidad visual y configuración adaptada", values: customOnly() }],
  },
  {
    title: "Gestión de equipo",
    rows: [{ label: "Usuarios, roles y permisos", values: all("Completa") }],
  },
];

export interface PlanCard {
  plan: TenantPlan;
  highlight?: string;
  bullets: string[];
  cta: string;
  footnote?: string;
}

export const PLAN_CARDS: PlanCard[] = [
  {
    plan: "BASE",
    bullets: [
      "Todos tus distribuidores conectados",
      `Buscá en hasta ${BASE_SEARCH_LIMIT} a la vez`,
      "Carrito multi-proveedor",
      "Generá pedidos y envialos por WhatsApp",
      "Equipo y permisos completos",
    ],
    cta: "Empezar con Base",
  },
  {
    plan: "PRO",
    highlight: "MÁS ELEGIDO",
    bullets: [
      "Buscá en todos tus distribuidores",
      "Pedidos directos al distribuidor",
      "Cuenta corriente y facturas integradas",
      "Chat comercial y analytics avanzados",
    ],
    cta: "Elegir Pro",
  },
  {
    plan: "CUSTOM",
    bullets: [
      "Una versión de NODO adaptada a la operación de tu empresa.",
      "Personalización, integraciones y flujos diseñados para tu operación.",
      "Todo lo de NODO Pro",
    ],
    cta: "Hablar con NODO",
    footnote: "Puesta en marcha: USD 300 (pago único)",
  },
];
