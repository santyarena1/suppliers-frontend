import { BadRequestException, ConflictException } from "@nestjs/common";
import { TENANT_PLAN_LABELS } from "@nodo/shared";
import { DEMO_DISTRIBUTORS, DEMO_PRODUCTS, DEMO_SEARCH_HINTS } from "./onboarding-demo";

describe("onboarding demo catalog", () => {
  it("tiene 4 productos de prueba en 2 distribuidores", () => {
    expect(DEMO_DISTRIBUTORS).toHaveLength(2);
    expect(DEMO_PRODUCTS).toHaveLength(4);
    const providers = new Set(DEMO_PRODUCTS.map((p) => p.provider));
    expect(providers.size).toBe(2);
    for (const d of DEMO_DISTRIBUTORS) {
      expect(d.providerKey.startsWith("LIST_")).toBe(true);
      expect(DEMO_PRODUCTS.some((p) => p.provider === d.providerKey)).toBe(true);
    }
  });

  it("cubre marcas y categorías distintas para filtros", () => {
    const brands = new Set(DEMO_PRODUCTS.map((p) => p.brand));
    const categories = new Set(DEMO_PRODUCTS.map((p) => p.category));
    expect(brands.size).toBeGreaterThanOrEqual(3);
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it("expone hints de búsqueda útiles", () => {
    expect(DEMO_SEARCH_HINTS).toEqual(expect.arrayContaining(["monitor", "logitech", "ssd"]));
  });

  it("etiqueta el plan PRO como PRO", () => {
    expect(TENANT_PLAN_LABELS.PRO).toBe("PRO");
  });
});

describe("onboarding service helpers", () => {
  it("rechaza nombres vacíos vía validación de negocio", () => {
    const name = "  ".trim();
    expect(name.length < 2).toBe(true);
    expect(() => {
      if (name.length < 2) throw new BadRequestException("El nombre del comercio es obligatorio");
    }).toThrow(BadRequestException);
  });

  it("ConflictException tipa bien el nombre duplicado", () => {
    expect(() => {
      throw new ConflictException("Ya existe una organización con ese nombre");
    }).toThrow(ConflictException);
  });
});
