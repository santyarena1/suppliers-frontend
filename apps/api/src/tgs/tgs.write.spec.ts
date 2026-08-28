import { assertJsonObject } from "./tgs.write";

describe("assertJsonObject", () => {
  it("acepta un objeto plano", () => {
    expect(assertJsonObject({ nombre: "Ana" })).toEqual({ nombre: "Ana" });
  });

  it("rechaza arrays y primitivos", () => {
    expect(() => assertJsonObject([])).toThrow();
    expect(() => assertJsonObject("x")).toThrow();
    expect(() => assertJsonObject(null)).toThrow();
  });
});
