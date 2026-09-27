import { hiddenForViewer } from "./tenant-visibility.service";

describe("hiddenForViewer", () => {
  const hidden = new Set(["GC", "ASHIR", "LIST_SENTEY"]);

  it("lo que no está oculto se ve", () => {
    expect(hiddenForViewer(hidden, "NEW_BYTES", false)).toBe(false);
  });

  it("una integración oculta por la plataforma no se ve", () => {
    expect(hiddenForViewer(hidden, "GC", false)).toBe(true);
  });

  it("un proveedor por lista nunca se oculta desde el admin", () => {
    expect(hiddenForViewer(hidden, "LIST_SENTEY", true)).toBe(false);
    expect(hiddenForViewer(hidden, "LIST_SENTEY", false)).toBe(false);
  });

  it("si el comercio cargó su propia lista, el ocultamiento global no lo tapa", () => {
    expect(hiddenForViewer(hidden, "ASHIR", true)).toBe(false);
    expect(hiddenForViewer(hidden, "ASHIR", false)).toBe(true);
  });
});
