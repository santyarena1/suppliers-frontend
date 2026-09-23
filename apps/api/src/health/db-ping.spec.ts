import { classifyDbPing } from "./db-ping";

describe("classifyDbPing", () => {
  it("ok sin error", () => {
    expect(classifyDbPing(null)).toBe("ok");
  });

  it("waiting ante recovery / unreachable / timeout", () => {
    expect(classifyDbPing(new Error("FATAL: the database system is starting up"))).toBe("waiting");
    expect(classifyDbPing(new Error("Can't reach database server at postgres"))).toBe("waiting");
    expect(classifyDbPing(new Error("db ping timeout"))).toBe("waiting");
  });

  it("down ante errores que no son de arranque", () => {
    expect(classifyDbPing(new Error("password authentication failed"))).toBe("down");
    expect(classifyDbPing(new Error("relation does not exist"))).toBe("down");
  });
});
