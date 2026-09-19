import { argentinaHour, isRetailDaytime } from "./retail-time";

describe("retail-time", () => {
  it("devuelve hora 0-23", () => {
    const h = argentinaHour(new Date("2026-08-26T18:00:00.000Z"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(24);
  });

  it("18:00 UTC es tarde en Argentina (UTC-3) — todavía de día", () => {
    const noonUtc = new Date("2026-08-26T18:00:00.000Z"); // 15:00 AR
    expect(argentinaHour(noonUtc)).toBe(15);
    expect(isRetailDaytime(noonUtc)).toBe(true);
  });

  it("01:00 UTC es 22:00 AR: todavía abierto (corta a las 23)", () => {
    const evening = new Date("2026-08-27T01:00:00.000Z");
    expect(argentinaHour(evening)).toBe(22);
    expect(isRetailDaytime(evening)).toBe(true);
  });

  it("02:00 UTC es 23:00 AR: silencio", () => {
    const late = new Date("2026-08-27T02:00:00.000Z");
    expect(argentinaHour(late)).toBe(23);
    expect(isRetailDaytime(late)).toBe(false);
  });
});
