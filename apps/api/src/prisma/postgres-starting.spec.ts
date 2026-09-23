import { isPostgresStarting, retryDelaySeconds, waitUntil } from "./postgres-starting";

describe("isPostgresStarting", () => {
  it("reconoce el recovery de Postgres y un Prisma que no llega al servidor", () => {
    expect(isPostgresStarting("FATAL: the database system is not yet accepting connections")).toBe(true);
    expect(isPostgresStarting("DETAIL: Consistent recovery state has not been yet reached.")).toBe(true);
    expect(isPostgresStarting("Can't reach database server at postgres.railway.internal")).toBe(true);
    expect(isPostgresStarting("P1001")).toBe(true);
  });

  it("no reintenta un error de migración o de clave", () => {
    expect(isPostgresStarting("Migration failed to apply cleanly")).toBe(false);
    expect(isPostgresStarting("password authentication failed")).toBe(false);
  });
});

describe("waitUntil", () => {
  it("espera mientras Postgres rechaza y sigue cuando conecta", async () => {
    const sleeps: number[] = [];
    const waits: number[] = [];
    let n = 0;
    const result = await waitUntil(
      async () => {
        n += 1;
        return n < 3 ? "not yet accepting connections" : "ok";
      },
      (value) => value === "ok",
      {
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        onWait: (attempt) => waits.push(attempt),
      }
    );
    expect(result).toBe("ok");
    expect(waits).toEqual([1, 2]);
    expect(sleeps).toEqual([2000, 4000]);
    expect(retryDelaySeconds(20)).toBe(15);
  });

  it("no espera si el fallo no es de arranque", async () => {
    const sleeps: number[] = [];
    const result = await waitUntil(
      async () => "password authentication failed",
      () => false,
      {
        retry: (value) => isPostgresStarting(value),
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        onWait: () => undefined,
      }
    );
    expect(result).toBe("password authentication failed");
    expect(sleeps).toEqual([]);
  });
});
