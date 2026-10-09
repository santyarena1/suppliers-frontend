import { hiddenForViewer, HiddenProviders } from "./tenant-visibility.service";

describe("hiddenForViewer", () => {
  const hidden: HiddenProviders = new Map([
    ["GC", new Set<string>()],
    ["LIST_SENTEY", new Set<string>()],
    ["DISTECNA", new Set(["org-a"])],
  ]);

  it("lo que no está oculto se ve", () => {
    expect(hiddenForViewer(hidden, "NEW_BYTES", "org-a")).toBe(false);
  });

  it("oculto es oculto para todos, también los proveedores por lista", () => {
    expect(hiddenForViewer(hidden, "GC", "org-a")).toBe(true);
    expect(hiddenForViewer(hidden, "LIST_SENTEY", "org-a")).toBe(true);
  });

  it("solo visible para las organizaciones habilitadas", () => {
    expect(hiddenForViewer(hidden, "DISTECNA", "org-a")).toBe(false);
    expect(hiddenForViewer(hidden, "DISTECNA", "org-b")).toBe(true);
  });
});
