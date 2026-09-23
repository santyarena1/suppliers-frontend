import {
  argentinaDayKey,
  collapsePriceHistoryByDay,
  fillPriceHistoryDays,
  pgDateToYmd,
  priceHistoryRetentionCutoff,
  PRICE_HISTORY_RETENTION_DAYS,
  PRICE_DROP_LOOKBACK_DAYS,
  addCalendarDay,
} from "./price-history";

describe("priceHistoryRetentionCutoff", () => {
  it("queda a 365 días atrás", () => {
    const now = new Date("2026-09-23T12:00:00.000Z");
    const cutoff = priceHistoryRetentionCutoff(now);
    expect(PRICE_HISTORY_RETENTION_DAYS).toBe(365);
    expect(now.getTime() - cutoff.getTime()).toBe(365 * 24 * 60 * 60 * 1000);
  });
});

describe("PRICE_DROP_LOOKBACK_DAYS", () => {
  it("es una semana calendario inclusive (hoy + 6 previos)", () => {
    expect(PRICE_DROP_LOOKBACK_DAYS).toBe(7);
    expect(addCalendarDay("2026-09-23", -(PRICE_DROP_LOOKBACK_DAYS - 1))).toBe("2026-09-17");
  });
});

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

describe("pgDateToYmd", () => {
  it("lee el DATE de Postgres como calendario UTC, sin corrimiento", () => {
    expect(pgDateToYmd(new Date("2026-09-17T00:00:00.000Z"))).toBe("2026-09-17");
    expect(pgDateToYmd("2026-09-17")).toBe("2026-09-17");
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
