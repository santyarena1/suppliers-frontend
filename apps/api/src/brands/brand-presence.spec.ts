import { brandPresence, hasBrandContact, hasBrandSpace } from "./brand-presence";

describe("brandPresence", () => {
  it("marca pendiente si el vínculo no tiene nada publicado", () => {
    const p = brandPresence({
      signalCount: 0,
      actionCount: 0,
      materialCount: 0,
      trainingCount: 0,
      hasContact: false,
      hasSpace: false,
    });
    expect(p.pending).toBe(true);
    expect(p.readyCount).toBe(0);
    expect(p.total).toBe(6);
    expect(p.modules.products.ready).toBe(false);
  });

  it("deja de ser pendiente en cuanto hay un módulo", () => {
    const p = brandPresence({
      signalCount: 3,
      actionCount: 0,
      materialCount: 0,
      trainingCount: 0,
      hasContact: false,
      hasSpace: false,
    });
    expect(p.pending).toBe(false);
    expect(p.readyCount).toBe(1);
    expect(p.modules.products).toEqual({ ready: true, count: 3 });
  });
});

describe("hasBrandSpace / hasBrandContact", () => {
  it("el logo o el about alcanzan para el espacio", () => {
    expect(hasBrandSpace({ logoUrl: "/assets/x" })).toBe(true);
    expect(hasBrandSpace({ about: "Quiénes somos" })).toBe(true);
    expect(hasBrandSpace({})).toBe(false);
  });

  it("cualquier dato de contacto cuenta", () => {
    expect(hasBrandContact({ supportEmail: "a@b.com" })).toBe(true);
    expect(hasBrandContact({ websiteUrl: "https://x.com" })).toBe(true);
    expect(hasBrandContact({})).toBe(false);
  });
});
