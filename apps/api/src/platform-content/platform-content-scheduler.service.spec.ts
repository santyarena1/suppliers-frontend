import { CATCH_UP_AFTER_MS, needsCatchUp } from "./platform-content-scheduler.service";

describe("needsCatchUp", () => {
  const now = new Date("2026-10-28T04:00:00Z");

  it("sin ninguna importación buena, hay que correr una", () => {
    expect(needsCatchUp(null, now)).toBe(true);
  });

  it("la última buena es de hace más de 20 h: se pone al día", () => {
    expect(needsCatchUp(new Date(now.getTime() - CATCH_UP_AFTER_MS - 1), now)).toBe(true);
  });

  it("una reciente alcanza: no se repite al reiniciar", () => {
    expect(needsCatchUp(new Date(now.getTime() - 60 * 60_000), now)).toBe(false);
  });
});
