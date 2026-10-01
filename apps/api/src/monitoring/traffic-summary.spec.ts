import { summarizeTraffic, type MetricInput } from "./traffic-summary";

const h = (iso: string) => new Date(iso);
const row = (o: Partial<MetricInput>): MetricInput => ({
  hourStart: h("2026-10-01T10:00:00Z"), method: "GET", route: "/my/providers", status: 200, count: 1, totalMs: 100, maxMs: 100, ...o,
});

describe("summarizeTraffic", () => {
  it("cuenta errores internos, límites y logins fallidos sin contar 401/404 como falla", () => {
    const s = summarizeTraffic(
      [
        row({ count: 90, totalMs: 9000 }),
        row({ status: 500, count: 2, totalMs: 400 }),
        row({ status: 429, count: 5, totalMs: 50 }),
        row({ status: 401, count: 3, route: "/auth/login", method: "POST" }),
        row({ status: 404, count: 4 }),
        row({ method: "OPTIONS", status: 204, count: 100 }),
      ],
      h("2026-10-01T10:00:00Z"),
      1
    );
    expect(s.requests).toBe(104);
    expect(s.serverErrors).toBe(2);
    expect(s.rateLimited).toBe(5);
    expect(s.failedLogins).toBe(3);
    expect(s.clientErrors).toBe(5);
    expect(s.serverErrorRate).toBeCloseTo(2 / 104);
    expect(s.topErrorRoutes[0]).toMatchObject({ route: "GET /my/providers", serverErrors: 2, rateLimited: 5 });
  });

  it("arma la línea de tiempo hora por hora, con huecos en cero", () => {
    const s = summarizeTraffic([row({ hourStart: h("2026-10-01T11:00:00Z"), count: 7 })], h("2026-10-01T10:00:00Z"), 2);
    expect(s.timeline.map((t) => t.requests)).toEqual([0, 7, 0]);
  });
});
