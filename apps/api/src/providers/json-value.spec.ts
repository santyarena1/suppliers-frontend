import { asString } from "./json-value";

describe("asString", () => {
  it("devuelve el texto recortado", () => {
    expect(asString("  RTX 4070  ")).toBe("RTX 4070");
  });

  it("descarta vacíos y nulos", () => {
    expect(asString("   ")).toBeUndefined();
    expect(asString(null)).toBeUndefined();
    expect(asString(undefined)).toBeUndefined();
  });

  it("mantiene números y booleanos", () => {
    expect(asString(0)).toBe("0");
    expect(asString(false)).toBe("false");
  });

  it("aplana listas en vez de imprimir comas sueltas", () => {
    expect(asString(["Bluetooth", "USB-C", ""])).toBe("Bluetooth · USB-C");
  });

  it("aplana objetos en vez de escupir [object Object]", () => {
    // Es lo que mandaba New Bytes en ATRIBUTOS y terminaba en la ficha.
    expect(asString({ Color: "Blanco", Peso: 1.17 })).toBe("Color: Blanco · Peso: 1.17");
  });

  it("no baja más de dos niveles ni deja rastros ilegibles", () => {
    const anidado = { a: { b: { c: "hondo" } } };
    expect(asString(anidado)).toBeUndefined();
    expect(asString({})).toBeUndefined();
  });
});

describe("asString con envoltorios del proveedor", () => {
  it("saca el texto de adentro del envoltorio", () => {
    expect(asString({ type: "plain/text", value: "Auricular inalámbrico" })).toBe(
      "Auricular inalámbrico",
    );
  });

  it("descarta el envoltorio cuando no trae texto", () => {
    // Era lo que se veía en la ficha: "type: plain/text" y nada más.
    expect(asString({ type: "plain/text" })).toBeUndefined();
    expect(asString({ type: "plain/text", value: "   " })).toBeUndefined();
  });

  it("no confunde metadatos con atributos reales", () => {
    expect(asString({ formato: "caja", Color: "Blanco" })).toBe("Color: Blanco");
  });
});
