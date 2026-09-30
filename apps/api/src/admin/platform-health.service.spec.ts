import {
  cronsAreGloballyEnabled,
  isCronQuietHours,
} from "../common/cron-window";

describe("platform health cron signals", () => {
  const prevCron = process.env.CRON_DISABLED;
  const prevRailway = process.env.RAILWAY_ENVIRONMENT_NAME;

  afterEach(() => {
    if (prevCron === undefined) delete process.env.CRON_DISABLED;
    else process.env.CRON_DISABLED = prevCron;
    if (prevRailway === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME;
    else process.env.RAILWAY_ENVIRONMENT_NAME = prevRailway;
  });

  it("detecta crons apagados por env", () => {
    process.env.CRON_DISABLED = "true";
    expect(cronsAreGloballyEnabled()).toBe(false);
  });

  it("detecta staging", () => {
    delete process.env.CRON_DISABLED;
    process.env.RAILWAY_ENVIRONMENT_NAME = "staging";
    expect(cronsAreGloballyEnabled()).toBe(false);
  });

  it("marca noche quieta en AR", () => {
    // 2026-09-30 02:00 UTC = 23:00 AR (UTC-3)
    const night = new Date("2026-09-30T02:00:00.000Z");
    expect(isCronQuietHours(night)).toBe(true);
    // 15:00 UTC = 12:00 AR
    const day = new Date("2026-09-30T15:00:00.000Z");
    expect(isCronQuietHours(day)).toBe(false);
  });
});
