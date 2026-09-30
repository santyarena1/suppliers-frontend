import {
  addDays,
  computeSubscriptionState,
  getPlanCapabilities,
  minimumPlanFor,
  paymentPeriod,
  pickSearchProvidersOnDowngrade,
  reminderDueNow,
  resolveEntitlements,
  selectSearchProviders,
  SUBSCRIPTION_POLICY,
  type SubscriptionDates,
} from "@nodo/shared";
import { checkEntitlements, ENTITLEMENT_ERROR_CODES } from "./entitlements";

const NOW = new Date("2026-10-10T12:00:00.000Z");

function sub(overrides: Partial<SubscriptionDates> = {}): SubscriptionDates {
  return {
    status: "ACTIVE",
    currentPeriodEnd: addDays(NOW, 10),
    nextBillingAt: addDays(NOW, 10),
    gracePeriodEnd: null,
    trialEndsAt: null,
    courtesyUntil: null,
    suspensionReason: null,
    ...overrides,
  };
}

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { getResponse(): { code?: string } }).getResponse().code;
  }
  return undefined;
}

describe("capacidades por plan", () => {
  it("Base: 5 proveedores en búsqueda y sin checkout directo", () => {
    const base = getPlanCapabilities("BASE");
    expect(base.maxSearchProviders).toBe(5);
    expect(base.directCheckout).toBe(false);
    expect(base.providerAccountAccess).toBe(false);
    expect(base.integratedChat).toBe(false);
  });

  it("Pro: sin tope y con todo lo operativo", () => {
    const pro = getPlanCapabilities("PRO");
    expect(pro.maxSearchProviders).toBeNull();
    expect(pro.directCheckout && pro.providerAccountAccess && pro.integratedChat && pro.advancedAnalytics).toBe(true);
    expect(pro.externalIntegrations).toBe(false);
  });

  it("Custom: todo Pro más integraciones y personalización", () => {
    const custom = getPlanCapabilities("CUSTOM");
    expect(custom.directCheckout).toBe(true);
    expect(custom.externalIntegrations && custom.customModules && custom.customBranding).toBe(true);
  });

  it("el plan mínimo de cada capacidad", () => {
    expect(minimumPlanFor("directCheckout")).toBe("PRO");
    expect(minimumPlanFor("externalIntegrations")).toBe("CUSTOM");
  });
});

describe("estado de la suscripción", () => {
  it("al día queda ACTIVE", () => {
    const state = computeSubscriptionState(sub(), NOW);
    expect(state).toMatchObject({ status: "ACTIVE", access: "FULL", daysUntilDue: 10 });
  });

  it("el día del vencimiento pasa a PAST_DUE y sigue operando", () => {
    const state = computeSubscriptionState(sub({ nextBillingAt: NOW, currentPeriodEnd: NOW }), NOW);
    expect(state).toMatchObject({ status: "PAST_DUE", access: "FULL" });
  });

  it("después del primer día entra en gracia", () => {
    const due = addDays(NOW, -3);
    const state = computeSubscriptionState(sub({ nextBillingAt: due, currentPeriodEnd: due }), NOW);
    expect(state).toMatchObject({ status: "GRACE_PERIOD", access: "FULL", daysOverdue: 3 });
    expect(state.suspendsAt?.toISOString()).toBe(addDays(due, SUBSCRIPTION_POLICY.graceDays).toISOString());
  });

  it("vencida la gracia queda suspendida (restringida, sin borrar nada)", () => {
    const due = addDays(NOW, -(SUBSCRIPTION_POLICY.graceDays + 1));
    const state = computeSubscriptionState(sub({ nextBillingAt: due, currentPeriodEnd: due }), NOW);
    expect(state).toMatchObject({ status: "SUSPENDED", access: "RESTRICTED" });
  });

  it("una gracia extendida a mano corre la suspensión", () => {
    const due = addDays(NOW, -10);
    const state = computeSubscriptionState(
      sub({ nextBillingAt: due, currentPeriodEnd: due, gracePeriodEnd: addDays(NOW, 2) }),
      NOW
    );
    expect(state.status).toBe("GRACE_PERIOD");
  });

  it("una suspensión manual se mantiene aunque las fechas estén al día", () => {
    const state = computeSubscriptionState(sub({ status: "SUSPENDED", suspensionReason: "MANUAL" }), NOW);
    expect(state).toMatchObject({ status: "SUSPENDED", access: "RESTRICTED" });
  });

  it("una suspensión por deuda se levanta sola si las fechas quedaron al día (pago registrado)", () => {
    const state = computeSubscriptionState(sub({ status: "SUSPENDED", suspensionReason: "OVERDUE" }), NOW);
    expect(state.status).toBe("ACTIVE");
  });

  it("cortesía sin vencimiento no vence nunca", () => {
    const state = computeSubscriptionState(sub({ status: "COURTESY", nextBillingAt: null, currentPeriodEnd: null }), NOW);
    expect(state).toMatchObject({ status: "COURTESY", access: "FULL", dueAt: null });
  });

  it("cortesía con fecha: vigente hasta ese día, después sigue el ciclo de vencimiento", () => {
    expect(computeSubscriptionState(sub({ status: "COURTESY", courtesyUntil: addDays(NOW, 5) }), NOW).status).toBe(
      "COURTESY"
    );
    expect(computeSubscriptionState(sub({ status: "COURTESY", courtesyUntil: addDays(NOW, -3) }), NOW).status).toBe(
      "GRACE_PERIOD"
    );
  });

  it("sin suscripción (comercio anterior a los planes) opera normal", () => {
    expect(computeSubscriptionState(null, NOW)).toMatchObject({ status: "ACTIVE", access: "FULL" });
  });
});

describe("entitlements", () => {
  it("distribuidores y marcas no tienen plan comercial", () => {
    for (const tenantType of ["DISTRIBUTOR", "BRAND"] as const) {
      const e = resolveEntitlements({ tenantType, plan: "BASE", subscription: sub({ status: "SUSPENDED", suspensionReason: "MANUAL" }), now: NOW });
      expect(e.enforced).toBe(false);
      expect(e.access).toBe("FULL");
    }
  });

  it("el superadmin en su sesión opera sin topes", () => {
    const e = resolveEntitlements({ tenantType: "RETAILER", plan: "BASE", subscription: null, platformAdmin: true, now: NOW });
    expect(e.enforced).toBe(false);
    expect(e.capabilities.maxSearchProviders).toBeNull();
  });

  it("Custom con la puesta en marcha pendiente y bloqueante opera como Pro", () => {
    const e = resolveEntitlements({
      tenantType: "RETAILER",
      plan: "CUSTOM",
      subscription: sub({ setupFeeStatus: "PENDING", setupFeeBlocksCustom: true }),
      now: NOW,
    });
    expect(e.capabilities.directCheckout).toBe(true);
    expect(e.capabilities.externalIntegrations).toBe(false);
  });
});

describe("TenantGuard: checkEntitlements", () => {
  const tenantOf = (plan: "BASE" | "PRO", subscription: SubscriptionDates | null = sub()) => ({
    entitlements: resolveEntitlements({ tenantType: "RETAILER", plan, subscription, now: NOW }),
  });

  it("Base no puede usar el checkout directo (lo rechaza el backend)", () => {
    expect(codeOf(() => checkEntitlements(tenantOf("BASE"), { method: "POST", capability: "directCheckout" }))).toBe(
      ENTITLEMENT_ERROR_CODES.featureUnavailable
    );
  });

  it("Pro sí", () => {
    expect(() => checkEntitlements(tenantOf("PRO"), { method: "POST", capability: "directCheckout" })).not.toThrow();
  });

  it("Base arma carrito y pedidos manuales (endpoints sin capacidad)", () => {
    expect(() => checkEntitlements(tenantOf("BASE"), { method: "POST" })).not.toThrow();
  });

  it("suspendido: lee, pero no escribe ni busca", () => {
    const suspended = tenantOf("PRO", sub({ status: "SUSPENDED", suspensionReason: "MANUAL" }));
    expect(() => checkEntitlements(suspended, { method: "GET" })).not.toThrow();
    expect(codeOf(() => checkEntitlements(suspended, { method: "POST" }))).toBe(ENTITLEMENT_ERROR_CODES.suspended);
    expect(codeOf(() => checkEntitlements(suspended, { method: "GET", requiresActive: true }))).toBe(
      ENTITLEMENT_ERROR_CODES.suspended
    );
    expect(() => checkEntitlements(suspended, { method: "POST", allowWhenRestricted: true })).not.toThrow();
  });

  it("en gracia sigue operando", () => {
    const due = addDays(NOW, -3);
    const grace = tenantOf("PRO", sub({ nextBillingAt: due, currentPeriodEnd: due }));
    expect(() => checkEntitlements(grace, { method: "POST", capability: "directCheckout" })).not.toThrow();
  });

  it("sin organización o sin entitlements no corta", () => {
    expect(() => checkEntitlements(null, { method: "POST" })).not.toThrow();
    expect(() => checkEntitlements({}, { method: "POST", capability: "directCheckout" })).not.toThrow();
  });
});

describe("proveedores activos en búsqueda", () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({
    provider: `P${i}`,
    name: `Proveedor ${String(i).padStart(2, "0")}`,
    includeInSearch: null as boolean | null,
    chosenAt: null as Date | null,
  }));

  it("Base: solo 5 a la vez, orden estable", () => {
    const first = selectSearchProviders(candidates, 5);
    expect(first.size).toBe(5);
    expect([...selectSearchProviders([...candidates].reverse(), 5)].sort()).toEqual([...first].sort());
  });

  it("los elegidos a mano van primero y los apagados nunca entran", () => {
    const withChoices = candidates.map((c, i) =>
      i === 9 ? { ...c, includeInSearch: true, chosenAt: NOW } : i === 0 ? { ...c, includeInSearch: false } : c
    );
    const selected = selectSearchProviders(withChoices, 5);
    expect(selected.has("P9")).toBe(true);
    expect(selected.has("P0")).toBe(false);
    expect(selected.size).toBe(5);
  });

  it("Pro: todos menos los que apagó el comercio", () => {
    const withOff = candidates.map((c, i) => (i === 3 ? { ...c, includeInSearch: false } : c));
    expect(selectSearchProviders(withOff, null).size).toBe(9);
  });

  it("downgrade: se quedan los activos usados más recientemente", () => {
    const picked = pickSearchProvidersOnDowngrade(
      candidates.map((c, i) => ({
        provider: c.provider,
        name: c.name,
        currentlyInSearch: true,
        lastUsedAt: addDays(NOW, -i),
      })),
      5
    );
    expect(picked).toEqual(["P0", "P1", "P2", "P3", "P4"]);
  });
});

describe("período de un pago", () => {
  const start = addDays(NOW, -20);
  const end = addDays(NOW, 10);

  it("adelantado: arranca donde termina el vigente", () => {
    const state = computeSubscriptionState(sub({ currentPeriodEnd: end, nextBillingAt: end }), NOW);
    const r = paymentPeriod({ state, currentPeriodStart: start, currentPeriodEnd: end, paidAt: NOW, months: 1, now: NOW });
    expect(r.periodStart.toISOString()).toBe(end.toISOString());
    expect(r.currentPeriodEnd > end).toBe(true);
  });

  it("atrasado en gracia: arranca en el vencimiento, no regala días", () => {
    const due = addDays(NOW, -3);
    const state = computeSubscriptionState(sub({ currentPeriodEnd: due, nextBillingAt: due }), NOW);
    const r = paymentPeriod({ state, currentPeriodStart: addDays(due, -30), currentPeriodEnd: due, paidAt: NOW, months: 1, now: NOW });
    expect(r.periodStart.toISOString()).toBe(due.toISOString());
  });

  it("suspendido: arranca el día del pago y reactiva", () => {
    const due = addDays(NOW, -30);
    const state = computeSubscriptionState(sub({ currentPeriodEnd: due, nextBillingAt: due }), NOW);
    expect(state.status).toBe("SUSPENDED");
    const r = paymentPeriod({ state, currentPeriodStart: addDays(due, -30), currentPeriodEnd: due, paidAt: NOW, months: 1, now: NOW });
    expect(r.periodStart.toISOString()).toBe(NOW.toISOString());
    const after = computeSubscriptionState(
      sub({ status: "ACTIVE", currentPeriodEnd: r.currentPeriodEnd, nextBillingAt: r.currentPeriodEnd }),
      NOW
    );
    expect(after.status).toBe("ACTIVE");
  });
});

describe("recordatorios", () => {
  it("7 días antes del vencimiento", () => {
    const state = computeSubscriptionState(sub({ nextBillingAt: addDays(NOW, 7), currentPeriodEnd: addDays(NOW, 7) }), NOW);
    expect(reminderDueNow(state, NOW)?.kind).toBe("UPCOMING_7D");
  });

  it("el cron caído no manda todos juntos: solo el último alcanzado", () => {
    const due = addDays(NOW, -4);
    const state = computeSubscriptionState(sub({ nextBillingAt: due, currentPeriodEnd: due }), NOW);
    expect(reminderDueNow(state, NOW)?.kind).toBe("OVERDUE_3D");
  });

  it("un día antes de la suspensión", () => {
    const due = addDays(NOW, -(SUBSCRIPTION_POLICY.graceDays - 1));
    const state = computeSubscriptionState(sub({ nextBillingAt: due, currentPeriodEnd: due }), NOW);
    expect(reminderDueNow(state, NOW)?.kind).toBe("SUSPENSION_TOMORROW");
  });

  it("cortesía sin fecha no genera recordatorios", () => {
    const state = computeSubscriptionState(sub({ status: "COURTESY", nextBillingAt: null, currentPeriodEnd: null }), NOW);
    expect(reminderDueNow(state, NOW)).toBeNull();
  });
});
