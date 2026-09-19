import {
  argentinaHour,
  cronsAreGloballyEnabled,
  isCronQuietHours,
  shouldRunScheduledJob,
} from "./cron-window";

describe("cron-window", () => {
  const origCron = process.env.CRON_DISABLED;
  const origName = process.env.RAILWAY_ENVIRONMENT_NAME;
  const origEnv = process.env.RAILWAY_ENVIRONMENT;

  afterEach(() => {
    if (origCron === undefined) delete process.env.CRON_DISABLED;
    else process.env.CRON_DISABLED = origCron;
    if (origName === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME;
    else process.env.RAILWAY_ENVIRONMENT_NAME = origName;
    if (origEnv === undefined) delete process.env.RAILWAY_ENVIRONMENT;
    else process.env.RAILWAY_ENVIRONMENT = origEnv;
  });

  it("15:00 AR (18:00 UTC en agosto) está en ventana activa", () => {
    const t = new Date("2026-08-26T18:00:00.000Z");
    expect(argentinaHour(t)).toBe(15);
    expect(isCronQuietHours(t)).toBe(false);
    expect(shouldRunScheduledJob(t)).toBe(true);
  });

  it("22:00 AR todavía corre (corta a las 23)", () => {
    const t = new Date("2026-08-27T01:00:00.000Z");
    expect(argentinaHour(t)).toBe(22);
    expect(isCronQuietHours(t)).toBe(false);
  });

  it("23:00 AR ya está en silencio", () => {
    const t = new Date("2026-08-27T02:00:00.000Z");
    expect(argentinaHour(t)).toBe(23);
    expect(isCronQuietHours(t)).toBe(true);
    expect(shouldRunScheduledJob(t)).toBe(false);
  });

  it("05:00 AR sigue en silencio; 06:00 reabre", () => {
    const five = new Date("2026-08-27T08:00:00.000Z");
    const six = new Date("2026-08-27T09:00:00.000Z");
    expect(argentinaHour(five)).toBe(5);
    expect(isCronQuietHours(five)).toBe(true);
    expect(argentinaHour(six)).toBe(6);
    expect(isCronQuietHours(six)).toBe(false);
  });

  it("CRON_DISABLED apaga todo aunque sea de día", () => {
    process.env.CRON_DISABLED = "true";
    const t = new Date("2026-08-26T18:00:00.000Z");
    expect(cronsAreGloballyEnabled()).toBe(false);
    expect(shouldRunScheduledJob(t)).toBe(false);
  });

  it("staging no corre crons", () => {
    delete process.env.CRON_DISABLED;
    process.env.RAILWAY_ENVIRONMENT_NAME = "staging";
    expect(cronsAreGloballyEnabled()).toBe(false);
  });
});
