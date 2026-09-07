import { computeDiff, percentChange } from "./diff";
import { evaluateSanity, uniformChangePercent } from "./sanity-checks";
import type { NormalizedProduct, } from "../providers/types";
import type { PreviousOffer } from "./types";

function item(externalId: string, price: number | undefined, name = externalId): NormalizedProduct {
  return { externalId, name, price, raw: {} };
}
function prev(externalId: string, price: number | null, name = externalId): PreviousOffer {
  return { externalId, name, price, finalPrice: null };
}

describe("computeDiff", () => {
  test("clasifica nuevos, cambiados, iguales y faltantes", () => {
    const diff = computeDiff([prev("A", 10), prev("B", 20), prev("C", 30)], [item("A", 10), item("B", 25), item("D", 5)]);
    expect(diff.counts).toEqual({ created: 1, priceChanged: 1, unchanged: 1, missing: 1, withoutPrice: 0 });
    expect(diff.samples.priceChanged[0]).toMatchObject({ externalId: "B", before: 20, after: 25, percent: 25 });
    expect(diff.missingIds).toEqual(["C"]);
  });

  test("cuenta filas sin precio", () => {
    const diff = computeDiff([], [item("A", undefined), item("B", 1)]);
    expect(diff.counts.withoutPrice).toBe(1);
  });

  test("percentChange", () => {
    expect(percentChange(100, 110)).toBe(10);
    expect(percentChange(0, 10)).toBeNull();
    expect(percentChange(null, 10)).toBeNull();
  });
});

describe("evaluateSanity", () => {
  const cleanDiff = computeDiff([prev("A", 10), prev("B", 20)], [item("A", 11), item("B", 20)]);

  test("carga limpia con perfil exacto: sin motivos", () => {
    expect(evaluateSanity({ diff: cleanDiff, rowsNow: 2, rowsBefore: 2, profileMatch: "EXACT" })).toEqual([]);
  });

  test("perfil propuesto o parcial siempre pide revisión", () => {
    expect(evaluateSanity({ diff: cleanDiff, rowsNow: 2, rowsBefore: 2, profileMatch: "PROPOSED" })).toHaveLength(1);
    expect(evaluateSanity({ diff: cleanDiff, rowsNow: 2, rowsBefore: 2, profileMatch: "PARTIAL" })).toHaveLength(1);
  });

  test("demasiados faltantes", () => {
    const previous = Array.from({ length: 10 }, (_, i) => prev(`P${i}`, 10));
    const diff = computeDiff(previous, previous.slice(0, 4).map((p) => item(p.externalId, 10)));
    const reasons = evaluateSanity({ diff, rowsNow: 4, rowsBefore: 10, profileMatch: "EXACT" });
    expect(reasons.some((r) => r.startsWith("Desaparecen"))).toBe(true);
    expect(reasons.some((r) => r.includes("trae 4 filas"))).toBe(true);
  });

  test("todos los precios cambiaron el mismo porcentaje", () => {
    const previous = Array.from({ length: 25 }, (_, i) => prev(`P${i}`, 100));
    const diff = computeDiff(previous, previous.map((p) => item(p.externalId, 120)));
    const reasons = evaluateSanity({ diff, rowsNow: 25, rowsBefore: 25, profileMatch: "EXACT" });
    expect(reasons.some((r) => r.includes("mismo") || r.includes("20 %"))).toBe(true);
  });

  test("filas sin precio válido por encima del umbral", () => {
    const diff = computeDiff([], [item("A", undefined), item("B", undefined), item("C", 1)]);
    const reasons = evaluateSanity({ diff, rowsNow: 3, rowsBefore: 0, profileMatch: "MANUAL" });
    expect(reasons.some((r) => r.includes("no tienen un precio válido"))).toBe(true);
  });

  test("primera carga sin anterior no compara faltantes", () => {
    const diff = computeDiff([], [item("A", 1)]);
    expect(evaluateSanity({ diff, rowsNow: 1, rowsBefore: 0, profileMatch: "EXACT" })).toEqual([]);
  });

  test("uniformChangePercent exige cantidad mínima", () => {
    expect(uniformChangePercent([10, 10, 10], 5)).toBeNull();
    expect(uniformChangePercent([10, 10.2, 9.9, 10, 10], 5)).toBe(10);
    expect(uniformChangePercent([10, 20, 10, 10, 10], 5)).toBeNull();
  });
});
