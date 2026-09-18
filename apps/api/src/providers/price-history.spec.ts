import { argentinaDayKey, collapsePriceHistoryByDay, fillPriceHistoryDays } from "./price-history";

describe("collapsePriceHistoryByDay", () => {
  it("deja un solo punto por día calendario AR, el último", () => {
    const points = [
      { capturedAt: new Date("2026-09-16T12:00:00.000Z"), price: 100 },
      { capturedAt: new Date("2026-09-16T20:00:00.000Z"), price: 90 },
      { capturedAt: new Date("2026-09-17T15:00:00.000Z"), price: 80 },
    ];
    const collapsed = collapsePriceHistoryByDay(points);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].price).toBe(90);
    expect(collapsed[1].price).toBe(80);
  });

  it("parte el día a medianoche de Argentina, no UTC", () => {
    // 02:30 UTC del 18 = 23:30 del 17 en Buenos Aires.
    const late = new Date("2026-09-18T02:30:00.000Z");
    expect(argentinaDayKey(late)).toBe("2026-09-17");
    const morning = new Date("2026-09-18T03:30:00.000Z");
    expect(argentinaDayKey(morning)).toBe("2026-09-18");
  });
});

describe("fillPriceHistoryDays", () => {
  it("rellena cada día calendario hasta hoy con el último precio", () => {
    const points = [
      { capturedAt: new Date("2026-09-14T15:00:00.000Z"), price: 100 },
      { capturedAt: new Date("2026-09-16T15:00:00.000Z"), price: 80 },
    ];
    const filled = fillPriceHistoryDays(points, new Date("2026-09-18T15:00:00.000Z"));
    expect(filled.map((p) => argentinaDayKey(p.capturedAt))).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
    expect(filled.map((p) => p.price)).toEqual([100, 100, 80, 80, 80]);
  });
});
