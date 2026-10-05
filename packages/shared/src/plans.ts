import type { TenantType } from "./tenants";
import { CATALOG_API_ADDON_PRICE_USD } from "./catalog-api";

/**
 * Planes comerciales de los comercios (tipo 1 / RETAILER) y su suscripción.
 *
 * El plan (qué tiene contratado) y la suscripción (si está al día) son cosas
 * separadas: `Tenant.plan` guarda el plan; `Subscription` guarda estado, fechas,
 * cortesía y pagos. Distribuidores y marcas todavía no tienen planes comerciales:
 * operan sin restricciones de plan.
 *
 * Diseño: docs/PLAN_SUSCRIPCIONES.md
 */

export type TenantPlan = "BASE" | "PRO" | "CUSTOM";

export const TENANT_PLANS: readonly TenantPlan[] = ["BASE", "PRO", "CUSTOM"] as const;

export function isTenantPlan(value: unknown): value is TenantPlan {
  return typeof value === "string" && (TENANT_PLANS as readonly string[]).includes(value);
}

export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "GRACE_PERIOD"
  | "SUSPENDED"
  | "COURTESY"
  | "CANCELLED";

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "GRACE_PERIOD",
  "SUSPENDED",
  "COURTESY",
  "CANCELLED",
] as const;

/** FULL: opera normal. RESTRICTED: entra, ve sus datos y su suscripción, pero no opera. */
export type SubscriptionAccess = "FULL" | "RESTRICTED";

export type SetupFeeStatus = "NOT_APPLICABLE" | "PENDING" | "PAID" | "WAIVED";

export type SubscriptionPaymentKind = "SUBSCRIPTION" | "SETUP_FEE";

export type SubscriptionPaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "VOIDED";

/**
 * Medio por el que entró un pago. Hoy se registran a mano desde Administración;
 * los gateways quedan listados para cuando se integren, sin atar el modelo a uno.
 */
export type SubscriptionPaymentProvider =
  | "MANUAL"
  | "TRANSFER"
  | "COURTESY"
  | "MERCADOPAGO"
  | "STRIPE"
  | "OTHER";

export const SUBSCRIPTION_PAYMENT_PROVIDERS: readonly SubscriptionPaymentProvider[] = [
  "MANUAL",
  "TRANSFER",
  "COURTESY",
  "MERCADOPAGO",
  "STRIPE",
  "OTHER",
] as const;

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

export const SUBSCRIPTION_PAYMENT_PROVIDER_LABELS: Record<SubscriptionPaymentProvider, string> = {
  MANUAL: "Manual",
  TRANSFER: "Transferencia",
  COURTESY: "Cortesía",
  MERCADOPAGO: "Mercado Pago",
  STRIPE: "Stripe",
  OTHER: "Otro",
};

export interface PlanDefinition {
  plan: TenantPlan;
  /** Nombre comercial ("NODO Pro"). */
  label: string;
  /** Nombre corto ("Pro"). */
  shortLabel: string;
  monthlyPrice: number;
  currency: "USD";
  /** Pago único de puesta en marcha. `null` si el plan no lo tiene. */
  setupFee: number | null;
  tagline: string;
}

export const PLAN_CATALOG: Record<TenantPlan, PlanDefinition> = {
  BASE: {
    plan: "BASE",
    label: "NODO Base",
    shortLabel: "Base",
    monthlyPrice: 45,
    currency: "USD",
    setupFee: null,
    tagline: "Centralizá y prepará tus compras.",
  },
  PRO: {
    plan: "PRO",
    label: "NODO Pro",
    shortLabel: "Pro",
    monthlyPrice: 60,
    currency: "USD",
    setupFee: null,
    tagline: "Gestioná tus compras y proveedores directamente desde NODO.",
  },
  CUSTOM: {
    plan: "CUSTOM",
    label: "NODO Custom",
    shortLabel: "Custom",
    monthlyPrice: 150,
    currency: "USD",
    setupFee: 300,
    tagline: "NODO adaptado a tu empresa.",
  },
};

/** Nombres de pantalla. */
export const TENANT_PLAN_LABELS: Record<TenantPlan, string> = {
  BASE: PLAN_CATALOG.BASE.label,
  PRO: PLAN_CATALOG.PRO.label,
  CUSTOM: PLAN_CATALOG.CUSTOM.label,
};

export const TENANT_PLAN_DESCRIPTIONS: Record<TenantPlan, string> = {
  BASE: PLAN_CATALOG.BASE.tagline,
  PRO: PLAN_CATALOG.PRO.tagline,
  CUSTOM: PLAN_CATALOG.CUSTOM.tagline,
};

// ---------- Capacidades ----------

export type PlanCapabilityKey =
  | "directCheckout"
  | "providerPortalAccess"
  | "providerAccountAccess"
  | "integratedChat"
  | "advancedAnalytics"
  | "externalIntegrations"
  | "customModules"
  | "customBranding"
  /** API de catálogo: incluida en Custom; en Base y Pro es un módulo extra pago. */
  | "catalogApi"
  /** Modo vendedor: márgenes de venta y precio de venta para el rol Vendedor (docs/PLAN_MODO_VENDEDOR.md). */
  | "sellerMode";

export const PLAN_CAPABILITY_KEYS: readonly PlanCapabilityKey[] = [
  "directCheckout",
  "providerPortalAccess",
  "providerAccountAccess",
  "integratedChat",
  "advancedAnalytics",
  "externalIntegrations",
  "customModules",
  "customBranding",
  "catalogApi",
  "sellerMode",
] as const;

export type PlanCapabilities = Record<PlanCapabilityKey, boolean> & {
  /** Proveedores que participan a la vez del buscador. `null` = sin tope (JSON no tiene Infinity). */
  maxSearchProviders: number | null;
};

const BASE_CAPABILITIES: PlanCapabilities = {
  maxSearchProviders: 5,
  directCheckout: false,
  providerPortalAccess: false,
  providerAccountAccess: false,
  integratedChat: false,
  advancedAnalytics: false,
  externalIntegrations: false,
  customModules: false,
  customBranding: false,
  catalogApi: false,
  sellerMode: false,
};

const PRO_CAPABILITIES: PlanCapabilities = {
  ...BASE_CAPABILITIES,
  maxSearchProviders: null,
  directCheckout: true,
  providerPortalAccess: true,
  providerAccountAccess: true,
  integratedChat: true,
  advancedAnalytics: true,
  sellerMode: true,
};

const CUSTOM_CAPABILITIES: PlanCapabilities = {
  ...PRO_CAPABILITIES,
  externalIntegrations: true,
  customModules: true,
  customBranding: true,
  catalogApi: true,
};

const CAPABILITIES_BY_PLAN: Record<TenantPlan, PlanCapabilities> = {
  BASE: BASE_CAPABILITIES,
  PRO: PRO_CAPABILITIES,
  CUSTOM: CUSTOM_CAPABILITIES,
};

/** Lo que incluye un plan. Única tabla de verdad: nada de `plan === "PRO"` en el código. */
export function getPlanCapabilities(plan: TenantPlan): PlanCapabilities {
  return { ...CAPABILITIES_BY_PLAN[plan] };
}

/** Distribuidores, marcas y el superadmin: sin restricciones de plan. */
export const UNRESTRICTED_CAPABILITIES: PlanCapabilities = { ...CUSTOM_CAPABILITIES };

/** El plan más barato que incluye una capacidad. */
export function minimumPlanFor(key: PlanCapabilityKey): TenantPlan {
  return TENANT_PLANS.find((plan) => CAPABILITIES_BY_PLAN[plan][key]) ?? "CUSTOM";
}

/** Textos de upgrade contextuales, uno por capacidad. */
export const PLAN_CAPABILITY_UPSELL: Record<PlanCapabilityKey, string> = {
  directCheckout: "Los pedidos directos al distribuidor están disponibles en NODO Pro.",
  providerPortalAccess: "La integración con los portales de los distribuidores está disponible en NODO Pro.",
  providerAccountAccess: "La cuenta corriente integrada está disponible en NODO Pro.",
  integratedChat: "El chat comercial con tus distribuidores está disponible en NODO Pro.",
  advancedAnalytics: "Los analytics avanzados de compras están disponibles en NODO Pro.",
  externalIntegrations: "Las integraciones con ERP, CRM y sistemas externos están disponibles en NODO Custom.",
  customModules: "Los módulos personalizados están disponibles en NODO Custom.",
  customBranding: "La identidad visual adaptada está disponible en NODO Custom.",
  catalogApi: `La API de catálogo es un módulo de US$ ${CATALOG_API_ADDON_PRICE_USD}/mes en Base y Pro, e incluido en NODO Custom.`,
  sellerMode: "El modo vendedor (márgenes y precios de venta) está disponible en NODO Pro.",
};

// ---------- Módulos extra ----------

/** Módulos que se contratan aparte del plan. Custom los trae incluidos. */
export interface SubscriptionAddons {
  catalogApi: boolean;
}

export const NO_ADDONS: SubscriptionAddons = { catalogApi: false };

/** ¿El plan ya incluye la API de catálogo (sin cobrarla aparte)? */
export function planIncludesCatalogApi(plan: TenantPlan): boolean {
  return CAPABILITIES_BY_PLAN[plan].catalogApi;
}

/** Lo que suman los módulos activos al mes. Lo incluido en el plan no se cobra. */
export function addonsMonthlyPrice(plan: TenantPlan, addons: SubscriptionAddons): number {
  return addons.catalogApi && !planIncludesCatalogApi(plan) ? CATALOG_API_ADDON_PRICE_USD : 0;
}

/** Cuota mensual: precio pactado (o de lista) del plan, más los módulos activos. */
export function monthlyAmount(plan: TenantPlan, priceOverride: number | null, addons: SubscriptionAddons): number {
  const base = priceOverride ?? PLAN_CATALOG[plan].monthlyPrice;
  return base + addonsMonthlyPrice(plan, addons);
}

export function searchLimitMessage(max: number): string {
  return `Tu plan Base permite buscar simultáneamente en hasta ${max} distribuidores. Desactivá uno de los actuales o pasá a NODO Pro para buscar en todos.`;
}

// ---------- Vencimientos ----------

export type SubscriptionReminderKind =
  | "UPCOMING_7D"
  | "UPCOMING_3D"
  | "DUE_TODAY"
  | "OVERDUE_3D"
  | "SUSPENSION_TOMORROW"
  | "SUSPENDED";

export interface SubscriptionReminderRule {
  kind: SubscriptionReminderKind;
  /** Desde qué fecha se cuenta: el vencimiento o la suspensión. */
  anchor: "due" | "suspension";
  /** Días respecto del ancla (negativo = antes). */
  offsetDays: number;
}

export interface SubscriptionPolicy {
  /** Días en PAST_DUE desde el vencimiento antes de pasar a GRACE_PERIOD. */
  pastDueDays: number;
  /** Días desde el vencimiento hasta la suspensión (incluye el tramo PAST_DUE). */
  graceDays: number;
  /** Prueba de un comercio nuevo que se registra solo. */
  trialDays: number;
  /** "Próximas a vencer" en Administración. */
  upcomingWindowDays: number;
  reminders: readonly SubscriptionReminderRule[];
}

/** Configuración central de vencimientos. Cambiar acá cambia toda la plataforma. */
export const SUBSCRIPTION_POLICY: SubscriptionPolicy = {
  pastDueDays: 1,
  graceDays: 7,
  trialDays: 14,
  upcomingWindowDays: 7,
  reminders: [
    { kind: "UPCOMING_7D", anchor: "due", offsetDays: -7 },
    { kind: "UPCOMING_3D", anchor: "due", offsetDays: -3 },
    { kind: "DUE_TODAY", anchor: "due", offsetDays: 0 },
    { kind: "OVERDUE_3D", anchor: "due", offsetDays: 3 },
    { kind: "SUSPENSION_TOMORROW", anchor: "suspension", offsetDays: -1 },
    { kind: "SUSPENDED", anchor: "suspension", offsetDays: 0 },
  ],
};

const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Suma meses de calendario; si el día no existe (31 → febrero) queda en el último día del mes. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Lo que hace falta de una suscripción para saber en qué estado está. */
export interface SubscriptionDates {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  nextBillingAt: Date | null;
  gracePeriodEnd: Date | null;
  trialEndsAt: Date | null;
  courtesyUntil: Date | null;
  /** MANUAL = la suspendió Administración y queda así hasta reactivarla. */
  suspensionReason: string | null;
  setupFeeStatus?: SetupFeeStatus;
  setupFeeBlocksCustom?: boolean;
  /** Módulo de API de catálogo contratado (Base y Pro). */
  catalogApiAddon?: boolean;
}

export interface SubscriptionState {
  /** Estado efectivo: el guardado corregido por las fechas de hoy. */
  status: SubscriptionStatus;
  access: SubscriptionAccess;
  /** Próximo vencimiento (o el que ya pasó y está pendiente). */
  dueAt: Date | null;
  /** Cuándo se suspende si no paga. */
  suspendsAt: Date | null;
  daysUntilDue: number | null;
  daysOverdue: number | null;
}

function whole(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

function overdueState(
  dueAt: Date,
  sub: Pick<SubscriptionDates, "gracePeriodEnd">,
  now: Date,
  policy: SubscriptionPolicy,
  notYet: SubscriptionStatus
): SubscriptionState {
  const suspendsAt = sub.gracePeriodEnd && sub.gracePeriodEnd > dueAt ? sub.gracePeriodEnd : addDays(dueAt, policy.graceDays);
  if (now < dueAt) {
    return { status: notYet, access: "FULL", dueAt, suspendsAt, daysUntilDue: whole(dueAt.getTime() - now.getTime()), daysOverdue: null };
  }
  const daysOverdue = whole(now.getTime() - dueAt.getTime());
  const pastDueUntil = addDays(dueAt, policy.pastDueDays);
  if (now < suspendsAt) {
    const status: SubscriptionStatus = now < pastDueUntil ? "PAST_DUE" : "GRACE_PERIOD";
    return { status, access: "FULL", dueAt, suspendsAt, daysUntilDue: null, daysOverdue };
  }
  return { status: "SUSPENDED", access: "RESTRICTED", dueAt, suspendsAt, daysUntilDue: null, daysOverdue };
}

/**
 * Estado real de una suscripción hoy.
 *
 * El guardado es un punto de partida; las fechas mandan. Así, aunque el cron no
 * haya corrido, nadie queda suspendido después de pagar ni sigue operando con
 * la gracia vencida. Sin fila (comercio de antes de los planes) es ACTIVE.
 */
export function computeSubscriptionState(
  sub: SubscriptionDates | null,
  now: Date = new Date(),
  policy: SubscriptionPolicy = SUBSCRIPTION_POLICY
): SubscriptionState {
  const open: SubscriptionState = { status: "ACTIVE", access: "FULL", dueAt: null, suspendsAt: null, daysUntilDue: null, daysOverdue: null };
  if (!sub) return open;

  switch (sub.status) {
    case "CANCELLED": {
      const end = sub.currentPeriodEnd;
      const stillPaid = Boolean(end && now < end);
      return {
        ...open,
        status: "CANCELLED",
        access: stillPaid ? "FULL" : "RESTRICTED",
        dueAt: end,
        daysUntilDue: stillPaid && end ? whole(end.getTime() - now.getTime()) : null,
      };
    }
    case "SUSPENDED":
      if (sub.suspensionReason !== "OVERDUE") {
        return { ...open, status: "SUSPENDED", access: "RESTRICTED", dueAt: sub.nextBillingAt ?? sub.currentPeriodEnd };
      }
      break;
    case "COURTESY":
      if (!sub.courtesyUntil) return { ...open, status: "COURTESY" };
      return overdueState(sub.courtesyUntil, sub, now, policy, "COURTESY");
    case "TRIAL": {
      const end = sub.trialEndsAt ?? sub.currentPeriodEnd;
      if (!end) return { ...open, status: "TRIAL" };
      return overdueState(end, sub, now, policy, "TRIAL");
    }
    default:
      break;
  }

  const dueAt = sub.nextBillingAt ?? sub.currentPeriodEnd;
  if (!dueAt) return open;
  return overdueState(dueAt, sub, now, policy, "ACTIVE");
}

// ---------- Entitlements ----------

export interface TenantEntitlements {
  /** `false` para distribuidores, marcas y el superadmin: no aplica plan. */
  enforced: boolean;
  plan: TenantPlan | null;
  status: SubscriptionStatus | null;
  access: SubscriptionAccess;
  capabilities: PlanCapabilities;
}

export const UNRESTRICTED_ENTITLEMENTS: TenantEntitlements = {
  enforced: false,
  plan: null,
  status: null,
  access: "FULL",
  capabilities: UNRESTRICTED_CAPABILITIES,
};

/**
 * Qué puede hacer una organización según su plan y su suscripción.
 *
 * Solo los comercios tienen plan comercial. El superadmin opera sin topes (en
 * su propia sesión; al entrar como otro usuario ve lo que ve ese usuario).
 * Un Custom con la puesta en marcha pendiente y marcada como bloqueante opera
 * como Pro hasta que se pague: no se le corta el servicio.
 */
export function resolveEntitlements(input: {
  tenantType: TenantType;
  plan: TenantPlan;
  subscription: SubscriptionDates | null;
  platformAdmin?: boolean;
  now?: Date;
  policy?: SubscriptionPolicy;
}): TenantEntitlements {
  if (input.tenantType !== "RETAILER" || input.platformAdmin) {
    return {
      ...UNRESTRICTED_ENTITLEMENTS,
      plan: input.tenantType === "RETAILER" ? input.plan : null,
      capabilities: { ...UNRESTRICTED_CAPABILITIES },
    };
  }
  const state = computeSubscriptionState(input.subscription, input.now, input.policy);
  const pendingSetup =
    input.plan === "CUSTOM" &&
    input.subscription?.setupFeeBlocksCustom === true &&
    input.subscription.setupFeeStatus === "PENDING";
  const capabilities = getPlanCapabilities(pendingSetup ? "PRO" : input.plan);
  // El módulo contratado aparte suma la capacidad sin cambiar de plan; Custom la
  // trae aunque opere como Pro por la puesta en marcha pendiente.
  if (input.subscription?.catalogApiAddon || planIncludesCatalogApi(input.plan)) capabilities.catalogApi = true;
  return { enforced: true, plan: input.plan, status: state.status, access: state.access, capabilities };
}

/** ¿Puede usar esta capacidad hoy? Con la suscripción suspendida, nada que opere. */
export function entitlementAllows(entitlements: TenantEntitlements, key: PlanCapabilityKey): boolean {
  if (!entitlements.enforced) return true;
  return entitlements.access === "FULL" && entitlements.capabilities[key];
}

// ---------- Proveedores activos en búsqueda ----------

export interface SearchProviderCandidate {
  provider: string;
  name: string;
  /** Lo que eligió el comercio. `null` = nunca eligió (entra por defecto si hay lugar). */
  includeInSearch: boolean | null;
  /** Cuándo lo eligió. Ordena a los elegidos: el primero elegido es el último que sale. */
  chosenAt: Date | null;
}

/**
 * Qué proveedores participan del buscador.
 *
 * Orden estable, para que el mismo comercio vea siempre los mismos: primero los
 * que prendió a mano (por fecha de elección), después los que nunca tocó (por
 * nombre). Con tope, los que no entran quedan conectados pero fuera de la búsqueda.
 */
export function selectSearchProviders(candidates: readonly SearchProviderCandidate[], max: number | null): Set<string> {
  const chosen = candidates
    .filter((c) => c.includeInSearch === true)
    .sort((a, b) => (a.chosenAt?.getTime() ?? 0) - (b.chosenAt?.getTime() ?? 0) || a.name.localeCompare(b.name, "es"));
  const untouched = candidates
    .filter((c) => c.includeInSearch === null)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const ordered = [...chosen, ...untouched];
  return new Set((max == null ? ordered : ordered.slice(0, Math.max(0, max))).map((c) => c.provider));
}

export interface DowngradeCandidate {
  provider: string;
  name: string;
  currentlyInSearch: boolean;
  /** Último uso real (pedido o sincronización). */
  lastUsedAt: Date | null;
}

/**
 * Al bajar a un plan con tope: cuáles quedan activos en búsqueda.
 * Se quedan los que ya estaban activos y se usaron más recientemente.
 * Los demás siguen conectados, solo salen del buscador.
 */
export function pickSearchProvidersOnDowngrade(candidates: readonly DowngradeCandidate[], max: number): string[] {
  return [...candidates]
    .sort(
      (a, b) =>
        Number(b.currentlyInSearch) - Number(a.currentlyInSearch) ||
        (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0) ||
        a.name.localeCompare(b.name, "es")
    )
    .slice(0, Math.max(0, max))
    .map((c) => c.provider);
}

// ---------- Pagos ----------

export interface PaymentPeriodInput {
  /** Estado efectivo antes del pago. */
  state: SubscriptionState;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  paidAt: Date;
  months: number;
  /** Período explícito que informa Administración (ej. "octubre 2026"). */
  periodStart?: Date | null;
  periodEnd?: Date | null;
  now: Date;
}

export interface PaymentPeriodResult {
  periodStart: Date;
  periodEnd: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

/**
 * Qué período cubre un pago y cómo queda la suscripción.
 *
 * - Adelantado (todavía al día): el período arranca donde termina el vigente.
 * - Atrasado dentro de la gracia: arranca en el vencimiento, para no regalar días
 *   ni correr la fecha de cobro.
 * - Suspendido o sin período: arranca el día del pago (reactivación).
 * - Un período explícito siempre gana.
 * La cobertura nunca retrocede: un pago de un mes viejo no acorta lo ya pagado.
 */
export function paymentPeriod(input: PaymentPeriodInput): PaymentPeriodResult {
  const months = Math.max(1, Math.floor(input.months || 1));
  const anchor = input.state.dueAt ?? input.currentPeriodEnd;
  let start: Date;
  if (input.periodStart) {
    start = input.periodStart;
  } else if (anchor && input.state.access === "FULL" && input.state.status !== "COURTESY") {
    start = anchor;
  } else {
    start = input.paidAt;
  }
  const end = input.periodEnd && input.periodEnd > start ? input.periodEnd : addMonths(start, months);

  const previousEnd = input.currentPeriodEnd;
  const currentPeriodEnd = previousEnd && previousEnd > end ? previousEnd : end;
  const contiguous = Boolean(previousEnd && input.currentPeriodStart && start.getTime() <= previousEnd.getTime());
  const currentPeriodStart =
    contiguous && input.currentPeriodStart && input.currentPeriodStart <= input.now ? input.currentPeriodStart : start;
  return { periodStart: start, periodEnd: end, currentPeriodStart, currentPeriodEnd };
}

// ---------- Recordatorios ----------

export interface ReminderDue {
  kind: SubscriptionReminderKind;
  /** Fecha del vencimiento del ciclo: dos ciclos distintos nunca se pisan. */
  anchorAt: Date;
  at: Date;
}

/**
 * El recordatorio que corresponde hoy, si hay alguno.
 *
 * Solo el más reciente ya alcanzado: si el cron estuvo caído una semana no se
 * mandan los seis juntos. Quién ya lo recibió lo resuelve la tabla (único por
 * suscripción, tipo, vencimiento y canal).
 */
export function reminderDueNow(
  state: SubscriptionState,
  now: Date,
  policy: SubscriptionPolicy = SUBSCRIPTION_POLICY
): ReminderDue | null {
  if (!state.dueAt || !state.suspendsAt) return null;
  let latest: ReminderDue | null = null;
  for (const rule of policy.reminders) {
    const base = rule.anchor === "due" ? state.dueAt : state.suspendsAt;
    const at = addDays(base, rule.offsetDays);
    if (at > now) continue;
    if (!latest || at >= latest.at) latest = { kind: rule.kind, anchorAt: state.dueAt, at };
  }
  return latest;
}

export const SUBSCRIPTION_REMINDER_COPY: Record<SubscriptionReminderKind, { title: string; body: string }> = {
  UPCOMING_7D: {
    title: "Tu suscripción vence en 7 días",
    body: "Regularizá el pago antes del vencimiento para mantener NODO activo sin interrupciones.",
  },
  UPCOMING_3D: {
    title: "Tu suscripción vence en 3 días",
    body: "Recordá regularizar el pago para mantener NODO activo.",
  },
  DUE_TODAY: {
    title: "Tu suscripción vence hoy",
    body: "Regularizá el pago para mantener NODO activo. Mientras tanto seguís operando normalmente.",
  },
  OVERDUE_3D: {
    title: "Tu suscripción está vencida",
    body: "Regularizá el pago para mantener NODO activo. Estás dentro del período de gracia.",
  },
  SUSPENSION_TOMORROW: {
    title: "Mañana se suspende tu cuenta",
    body: "Si no regularizás el pago, mañana NODO pasa a modo restringido. No se borra ningún dato.",
  },
  SUSPENDED: {
    title: "Tu cuenta está suspendida",
    body: "NODO quedó en modo restringido. Tus datos están intactos: regularizá el pago para reactivarlo al instante.",
  },
};
