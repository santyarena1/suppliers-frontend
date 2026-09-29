import { incompleteSyncMessage, missingActionIsSafe, shouldUnhideOnConfigChange } from "./missing-guard";

describe("missingActionIsSafe", () => {
  it("con catálogo chico siempre aplica (no hay base para comparar)", () => {
    expect(missingActionIsSafe(5, 0)).toBe(true);
  });

  it("aplica si vino al menos la mitad", () => {
    expect(missingActionIsSafe(1000, 980)).toBe(true);
    expect(missingActionIsSafe(1000, 500)).toBe(true);
  });

  it("frena si vino mucho menos: es una sincronización incompleta", () => {
    expect(missingActionIsSafe(1000, 120)).toBe(false);
    expect(missingActionIsSafe(1000, 0)).toBe(false);
  });

  it("el aviso dice cuánto vino", () => {
    expect(incompleteSyncMessage(1000, 120)).toMatch(/trajo 120 de 1000/);
  });
});

describe("shouldUnhideOnConfigChange", () => {
  it("si se deja de ocultar, se vuelve a mostrar lo oculto", () => {
    expect(shouldUnhideOnConfigChange({ zeroStockAction: "HIDE", missingProductAction: "KEEP" }, { zeroStockAction: "KEEP", missingProductAction: "KEEP" })).toBe(true);
  });
  it("si otra acción sigue ocultando, no se toca", () => {
    expect(shouldUnhideOnConfigChange({ zeroStockAction: "HIDE", missingProductAction: "HIDE" }, { zeroStockAction: "KEEP", missingProductAction: "HIDE" })).toBe(false);
  });
  it("si nunca ocultaba, no hay nada que mostrar", () => {
    expect(shouldUnhideOnConfigChange({ zeroStockAction: "KEEP", missingProductAction: "KEEP" }, { zeroStockAction: "KEEP", missingProductAction: "KEEP" })).toBe(false);
  });
});
