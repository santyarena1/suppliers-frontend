import { isLocked, lockForFailure, minutesLeft } from "./login-lockout";

describe("login-lockout", () => {
  it("no bloquea antes del quinto fallo", () => {
    for (let i = 1; i < 5; i++) expect(lockForFailure(i)).toBeNull();
  });

  it("bloquea 15 min al quinto, 1 h al décimo y 6 h desde el decimoquinto", () => {
    expect(lockForFailure(5)).toBe(15 * 60_000);
    expect(lockForFailure(6)).toBeNull();
    expect(lockForFailure(10)).toBe(60 * 60_000);
    expect(lockForFailure(15)).toBe(6 * 60 * 60_000);
    expect(lockForFailure(40)).toBe(6 * 60 * 60_000);
  });

  it("sabe si sigue bloqueada y cuánto falta", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(isLocked(new Date("2026-10-01T10:10:00Z"), now)).toBe(true);
    expect(isLocked(new Date("2026-10-01T09:59:00Z"), now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
    expect(minutesLeft(new Date("2026-10-01T10:10:00Z"), now)).toBe(10);
  });
});
