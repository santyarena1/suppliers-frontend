import { effectiveSyncMinutes, isAccessBlockedError, manualSyncWaitMinutes, shouldPauseOnFirstFailure } from "./provider-rate-limits";

describe("effectiveSyncMinutes", () => {
  it("Grupo Núcleo y Solution Box no bajan de su mínimo aunque el comercio pida 1 h", () => {
    expect(effectiveSyncMinutes("GRUPO_NUCLEO", 60)).toBe(720);
    expect(effectiveSyncMinutes("SOLUTION_BOX", 60)).toBe(720);
  });

  it("un intervalo más largo que el mínimo se respeta", () => {
    expect(effectiveSyncMinutes("SOLUTION_BOX", 720)).toBe(720);
  });

  it("Masnet, Microglobal y PC Arts no bajan de 2 h", () => {
    expect(effectiveSyncMinutes("MASNET", 60)).toBe(120);
    expect(effectiveSyncMinutes("MICROGLOBAL", 30)).toBe(120);
    expect(effectiveSyncMinutes("PC_ARTS", 240)).toBe(240);
  });

  it("los demás distribuidores siguen con lo configurado", () => {
    expect(effectiveSyncMinutes("ELIT", 60)).toBe(60);
  });
});

describe("manualSyncWaitMinutes", () => {
  const now = new Date("2026-10-19T15:00:00Z");

  it("pide esperar si hubo un intento hace menos de 60 min", () => {
    expect(manualSyncWaitMinutes("SOLUTION_BOX", new Date("2026-10-19T14:50:00Z"), now)).toBe(50);
  });

  it("deja sincronizar pasado el plazo o sin intentos previos", () => {
    expect(manualSyncWaitMinutes("SOLUTION_BOX", new Date("2026-10-19T13:50:00Z"), now)).toBe(0);
    expect(manualSyncWaitMinutes("GRUPO_NUCLEO", null, now)).toBe(0);
  });

  it("no limita a distribuidores sin cooldown", () => {
    expect(manualSyncWaitMinutes("ELIT", new Date("2026-10-19T14:59:00Z"), now)).toBe(0);
  });
});

describe("isAccessBlockedError", () => {
  it("reconoce 403 y 429", () => {
    expect(isAccessBlockedError("Request failed with status code 403")).toBe(true);
    expect(isAccessBlockedError("Solution Box limitó los pedidos (429): se reintenta en la próxima sincronización")).toBe(true);
  });

  it("no confunde caídas o timeouts con un bloqueo", () => {
    expect(isAccessBlockedError("socket hang up")).toBe(false);
    expect(isAccessBlockedError("timeout of 60000ms exceeded")).toBe(false);
  });
});

describe("shouldPauseOnFirstFailure", () => {
  it("solo para los distribuidores que suspenden la cuenta", () => {
    expect(shouldPauseOnFirstFailure("GRUPO_NUCLEO", "Request failed with status code 403")).toBe(true);
    expect(shouldPauseOnFirstFailure("ELIT", "Request failed with status code 403")).toBe(false);
    expect(shouldPauseOnFirstFailure("SOLUTION_BOX", "socket hang up")).toBe(false);
    expect(shouldPauseOnFirstFailure("PC_ARTS", "PC Arts (operación 1004, offset 0): Request failed with status code 429")).toBe(true);
  });
});
