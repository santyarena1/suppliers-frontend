import { addDays, computeSubscriptionState, type SubscriptionDates } from "@nodo/shared";
import { statusSyncPatch } from "./subscription-reminders.service";
import { initialSubscription } from "./subscription-init";

const NOW = new Date("2026-10-10T12:00:00.000Z");

function dates(overrides: Partial<SubscriptionDates>): SubscriptionDates {
  return {
    status: "ACTIVE",
    currentPeriodEnd: null,
    nextBillingAt: null,
    gracePeriodEnd: null,
    trialEndsAt: null,
    courtesyUntil: null,
    suspensionReason: null,
    ...overrides,
  };
}

function patchFor(sub: SubscriptionDates) {
  return statusSyncPatch(sub, computeSubscriptionState(sub, NOW), NOW);
}

describe("statusSyncPatch", () => {
  it("guarda la suspensión por deuda", () => {
    expect(patchFor(dates({ nextBillingAt: addDays(NOW, -30) }))).toMatchObject({ status: "SUSPENDED", suspensionReason: "OVERDUE" });
  });

  it("una prueba vencida conserva la fecha de vencimiento al pasar a vencida", () => {
    const end = addDays(NOW, -2);
    expect(patchFor(dates({ status: "TRIAL", trialEndsAt: end }))).toMatchObject({ status: "GRACE_PERIOD", nextBillingAt: end });
  });

  it("no toca una suspensión manual ni una cancelación", () => {
    expect(patchFor(dates({ status: "SUSPENDED", suspensionReason: "MANUAL" }))).toBeNull();
    expect(patchFor(dates({ status: "CANCELLED", currentPeriodEnd: addDays(NOW, -40) }))).toBeNull();
  });

  it("levanta la suspensión por deuda si ya está al día", () => {
    expect(
      patchFor(dates({ status: "SUSPENDED", suspensionReason: "OVERDUE", nextBillingAt: addDays(NOW, 20) }))
    ).toMatchObject({ status: "ACTIVE", suspensionReason: null });
  });

  it("al día no cambia nada", () => {
    expect(patchFor(dates({ nextBillingAt: addDays(NOW, 20) }))).toBeNull();
  });
});

describe("initialSubscription", () => {
  it("self-serve: prueba de 14 días", () => {
    const data = initialSubscription({ plan: "BASE", mode: "TRIAL", now: NOW });
    expect(data.status).toBe("TRIAL");
    expect(data.trialEndsAt?.toISOString()).toBe(addDays(NOW, 14).toISOString());
    expect(data.setupFeeStatus).toBe("NOT_APPLICABLE");
  });

  it("Custom arranca con la puesta en marcha pendiente", () => {
    expect(initialSubscription({ plan: "CUSTOM", mode: "ACTIVE", now: NOW })).toMatchObject({ setupFee: 300, setupFeeStatus: "PENDING" });
  });
});
