import {
  addDays,
  addMonths,
  PLAN_CATALOG,
  SUBSCRIPTION_POLICY,
  type SubscriptionPolicy,
  type SubscriptionStatus,
  type TenantPlan,
} from "@nodo/shared";

/**
 * Cómo arranca la suscripción de un comercio nuevo.
 * - TRIAL: alta self-serve (prueba de `trialDays`, después vence como cualquiera).
 * - ACTIVE: alta desde Administración con primer vencimiento en un mes.
 * - COURTESY: sin cobro, con o sin fecha de fin.
 */
export type InitialSubscriptionMode = "TRIAL" | "ACTIVE" | "COURTESY";

export interface InitialSubscriptionInput {
  plan: TenantPlan;
  mode: InitialSubscriptionMode;
  now?: Date;
  courtesyUntil?: Date | null;
  courtesyReason?: string | null;
  firstBillingAt?: Date | null;
  policy?: SubscriptionPolicy;
}

export interface InitialSubscriptionData {
  status: SubscriptionStatus;
  startedAt: Date;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  nextBillingAt: Date | null;
  trialEndsAt: Date | null;
  courtesyUntil: Date | null;
  courtesyReason: string | null;
  setupFee: number | null;
  setupFeeStatus: "NOT_APPLICABLE" | "PENDING";
}

export function initialSubscription(input: InitialSubscriptionInput): InitialSubscriptionData {
  const now = input.now ?? new Date();
  const policy = input.policy ?? SUBSCRIPTION_POLICY;
  const setupFee = PLAN_CATALOG[input.plan].setupFee;
  const base = {
    startedAt: now,
    currentPeriodStart: now,
    trialEndsAt: null,
    courtesyUntil: null,
    courtesyReason: null,
    setupFee,
    setupFeeStatus: setupFee == null ? ("NOT_APPLICABLE" as const) : ("PENDING" as const),
  };
  switch (input.mode) {
    case "TRIAL": {
      const end = addDays(now, policy.trialDays);
      return { ...base, status: "TRIAL", currentPeriodEnd: end, nextBillingAt: end, trialEndsAt: end };
    }
    case "COURTESY":
      return {
        ...base,
        status: "COURTESY",
        currentPeriodEnd: input.courtesyUntil ?? null,
        nextBillingAt: input.courtesyUntil ?? null,
        courtesyUntil: input.courtesyUntil ?? null,
        courtesyReason: input.courtesyReason?.trim() || null,
      };
    case "ACTIVE":
    default: {
      const end = input.firstBillingAt ?? addMonths(now, 1);
      return { ...base, status: "ACTIVE", currentPeriodEnd: end, nextBillingAt: end };
    }
  }
}
