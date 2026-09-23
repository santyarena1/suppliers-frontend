import { DB_RESTARTING_MESSAGE, dbOutageStatus, recoveryHttpResponse } from "./recovery-gate";

describe("recoveryHttpResponse", () => {
  it("responde 200 en /health para que Railway no corte el deploy", () => {
    expect(recoveryHttpResponse("GET", "/health")).toEqual({
      status: 200,
      body: { success: true, data: { status: "ok", db: "waiting" } },
    });
    expect(recoveryHttpResponse("GET", "/health?x=1").status).toBe(200);
  });

  it("el login y el resto avisan que la base está reiniciando", () => {
    expect(recoveryHttpResponse("POST", "/auth/login")).toEqual({
      status: 503,
      body: { success: false, message: DB_RESTARTING_MESSAGE },
    });
  });

  it("deja pasar el preflight", () => {
    expect(recoveryHttpResponse("OPTIONS", "/auth/login").status).toBe(204);
  });
});

describe("dbOutageStatus", () => {
  it("traduce el rechazo de Postgres a 503", () => {
    expect(dbOutageStatus("FATAL: the database system is not yet accepting connections")).toEqual({
      status: 503,
      message: DB_RESTARTING_MESSAGE,
    });
    expect(dbOutageStatus("Can't reach database server at postgres.railway.internal")?.status).toBe(503);
  });

  it("no esconde un error de clave o de migración", () => {
    expect(dbOutageStatus("password authentication failed")).toBeNull();
    expect(dbOutageStatus("Migration failed to apply cleanly")).toBeNull();
  });
});
