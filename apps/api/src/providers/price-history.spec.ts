import { argentinaDayKey, collapsePriceHistoryByDay } from "./price-history";

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
