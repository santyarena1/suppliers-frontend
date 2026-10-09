import { SYNC_BACKOFF_CAP_MS, isSyncDue, nextSyncAt, pricesAreStale, syncFailureReason } from "./sync-backoff";

const HOUR = 60 * 60_000;
const base = {
  enabled: true,
  syncIntervalMinutes: 60,
  lastSyncedAt: new Date("2026-10-01T10:00:00Z"),
  lastAttemptAt: new Date("2026-10-01T10:00:00Z"),
  consecutiveFailures: 0,
  pausedAt: null,
};

describe("nextSyncAt / isSyncDue", () => {
  it("sin fallos: un intervalo después de la última sync OK", () => {
    expect(nextSyncAt(base)?.toISOString()).toBe("2026-10-01T11:00:00.000Z");
    expect(isSyncDue(base, new Date("2026-10-01T10:59:00Z"))).toBe(false);
    expect(isSyncDue(base, new Date("2026-10-01T11:00:00Z"))).toBe(true);
  });

  it("nunca sincronizado: corre ya", () => {
    expect(isSyncDue({ ...base, lastSyncedAt: null, lastAttemptAt: null })).toBe(true);
  });

  it("con fallos: backoff exponencial desde el último intento", () => {
    const failing = { ...base, lastAttemptAt: new Date("2026-10-01T12:00:00Z") };
    expect(nextSyncAt({ ...failing, consecutiveFailures: 1 })?.toISOString()).toBe("2026-10-01T14:00:00.000Z");
    // Con intervalo de 1 h el tope de 2 h llega enseguida: un proveedor caído se prueba cada 2 h.
    expect(nextSyncAt({ ...failing, consecutiveFailures: 3 })?.toISOString()).toBe("2026-10-01T14:00:00.000Z");
  });

  it("el backoff tiene tope de 2 h", () => {
    const at = nextSyncAt({ ...base, consecutiveFailures: 20 })!;
    expect(at.getTime() - base.lastAttemptAt.getTime()).toBe(SYNC_BACKOFF_CAP_MS);
  });

  it("pausado por error no corre solo (se reactiva a mano); deshabilitado tampoco", () => {
    expect(nextSyncAt({ ...base, pausedAt: new Date() })).toBeNull();
    expect(nextSyncAt({ ...base, enabled: false })).toBeNull();
    expect(isSyncDue({ ...base, pausedAt: new Date() }, new Date("2030-01-01"))).toBe(false);
  });
});

describe("pricesAreStale", () => {
  const now = new Date("2026-10-03T10:00:00Z");

  it("con auto-sync cada hora, más de 2 h sin sync OK es viejo", () => {
    expect(pricesAreStale({ enabled: true, syncIntervalMinutes: 60, lastSyncedAt: new Date(now.getTime() - 3 * HOUR) }, now)).toBe(true);
    expect(pricesAreStale({ enabled: true, syncIntervalMinutes: 60, lastSyncedAt: new Date(now.getTime() - HOUR) }, now)).toBe(false);
  });

  it("sin auto-sync, recién a las 48 h", () => {
    expect(pricesAreStale({ enabled: false, syncIntervalMinutes: 60, lastSyncedAt: new Date(now.getTime() - 30 * HOUR) }, now)).toBe(false);
    expect(pricesAreStale({ enabled: false, syncIntervalMinutes: 60, lastSyncedAt: new Date(now.getTime() - 49 * HOUR) }, now)).toBe(true);
  });

  it("intervalos largos no pasan de 48 h", () => {
    expect(pricesAreStale({ enabled: true, syncIntervalMinutes: 1440, lastSyncedAt: new Date(now.getTime() - 49 * HOUR) }, now)).toBe(true);
  });

  it("nunca sincronizado no cuenta como viejo", () => {
    expect(pricesAreStale({ enabled: true, syncIntervalMinutes: 60, lastSyncedAt: null }, now)).toBe(false);
  });
});

describe("syncFailureReason", () => {
  it.each([
    ["Request failed with status code 403", /rechazó el acceso \(403\)/],
    ["Mail o contraseña incorrectos", /no es válida/],
    ["Request failed with status code 401", /no es válida/],
    ["Request failed with status code 429", /limitó las consultas/],
    ["getaddrinfo EAI_AGAIN api.nb.com.ar", /no responde/],
    ["timeout of 30000ms exceeded", /no responde/],
    ["Cloudflare challenge", /Cloudflare/],
    ["No hay credenciales guardadas para ELIT", /No hay cuenta cargada/],
    ["algo raro", /La sincronización falló: algo raro/],
  ])("%s", (message, expected) => {
    expect(syncFailureReason(message)).toMatch(expected);
  });
});
