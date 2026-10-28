import * as cronWindow from "../common/cron-window";
import { CATCH_UP_AFTER_MS, PlatformContentSchedulerService, needsCatchUp } from "./platform-content-scheduler.service";

describe("importación por cambios en AcuStock", () => {
  const make = (changed: number, lastOk: Date | null) => {
    const content = { isConfigured: () => true, changedSince: jest.fn(async () => changed), start: jest.fn(async () => ({ runId: "r1" })) };
    const prisma = { platformContentImportRun: { findFirst: jest.fn(async () => (lastOk ? { startedAt: lastOk, finishedAt: lastOk } : null)) } };
    const config = { get: () => undefined };
    return { content, s: new PlatformContentSchedulerService(content as never, prisma as never, config as never) };
  };
  beforeEach(() => jest.spyOn(cronWindow, "shouldRunScheduledJob").mockReturnValue(true));
  afterEach(() => jest.restoreAllMocks());

  it("si cambió algo desde la última buena, importa", async () => {
    const { content, s } = make(3, new Date("2026-10-27T20:00:00Z"));
    await s.hourly();
    expect(content.changedSince).toHaveBeenCalledWith(new Date("2026-10-27T20:00:00Z"));
    expect(content.start).toHaveBeenCalledWith("APPLY");
  });

  it("sin cambios no importa", async () => {
    const { content, s } = make(0, new Date());
    await s.hourly();
    expect(content.start).not.toHaveBeenCalled();
  });

  it("sin ninguna importación buena, importa sin preguntar", async () => {
    const { content, s } = make(0, null);
    await s.hourly();
    expect(content.changedSince).not.toHaveBeenCalled();
    expect(content.start).toHaveBeenCalled();
  });
});

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
