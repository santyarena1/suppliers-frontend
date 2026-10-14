import { SubscriptionsService } from "./subscriptions.service";

// totalOf / catalogApiAddonOf son privados: se prueba la regla tal como la usa el servicio.
const svc = SubscriptionsService.prototype as unknown as {
  totalOf: (plan: string, sub: Record<string, unknown> | null) => number;
  catalogApiAddonOf: (plan: string, sub: Record<string, unknown> | null) => { enabled: boolean; courtesy: boolean; includedInPlan: boolean };
};

describe("API de catálogo: incluida en todos los planes", () => {
  it("en Pro viene incluida y no suma a la cuota aunque estuviera activada como módulo", () => {
    const sub = { priceOverride: null, catalogApiAddon: true, catalogApiAddonCourtesy: false, catalogApiAddonSince: null };
    expect(svc.totalOf.call(svc, "PRO", sub)).toBe(38);
    expect(svc.catalogApiAddonOf.call(svc, "PRO", sub)).toMatchObject({ enabled: true, includedInPlan: true, courtesy: false });
  });

  it("en Pro sin el módulo activado igual está habilitada", () => {
    expect(svc.catalogApiAddonOf.call(svc, "PRO", null)).toMatchObject({ enabled: true, includedInPlan: true });
  });

  it("en Custom viene incluida: no es cortesía ni se cobra aparte", () => {
    const sub = { priceOverride: null, catalogApiAddon: true, catalogApiAddonCourtesy: true, catalogApiAddonSince: null };
    expect(svc.catalogApiAddonOf.call(svc, "CUSTOM", sub)).toMatchObject({ includedInPlan: true, courtesy: false });
  });
});
