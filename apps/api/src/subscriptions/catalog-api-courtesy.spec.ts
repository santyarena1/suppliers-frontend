import { SubscriptionsService } from "./subscriptions.service";

// totalOf / catalogApiAddonOf son privados: se prueba la regla tal como la usa el servicio.
const svc = SubscriptionsService.prototype as unknown as {
  totalOf: (plan: string, sub: Record<string, unknown> | null) => number;
  catalogApiAddonOf: (plan: string, sub: Record<string, unknown> | null) => { enabled: boolean; courtesy: boolean; includedInPlan: boolean };
};

describe("API de catálogo: cobrada o de cortesía", () => {
  it("activa y cobrada suma US$ 10 a la cuota", () => {
    expect(svc.totalOf.call(svc, "PRO", { priceOverride: null, catalogApiAddon: true, catalogApiAddonCourtesy: false })).toBe(55);
  });

  it("de cortesía queda activa pero no suma", () => {
    const sub = { priceOverride: null, catalogApiAddon: true, catalogApiAddonCourtesy: true, catalogApiAddonSince: null };
    expect(svc.totalOf.call(svc, "PRO", sub)).toBe(45);
    expect(svc.catalogApiAddonOf.call(svc, "PRO", sub)).toMatchObject({ enabled: true, courtesy: true });
  });

  it("en Custom viene incluida: no es cortesía ni se cobra aparte", () => {
    const sub = { priceOverride: null, catalogApiAddon: true, catalogApiAddonCourtesy: true, catalogApiAddonSince: null };
    expect(svc.catalogApiAddonOf.call(svc, "CUSTOM", sub)).toMatchObject({ includedInPlan: true, courtesy: false });
  });
});
