import {
  DB_DOWN_MESSAGE,
  DB_RESTARTING_MESSAGE,
  dbOutageStatus,
  isDbUnhealthy,
  recoveryHttpResponse,
} from "./recovery-gate";

describe("recoveryHttpResponse", () => {
  it("responde 200 en /health para que Railway no corte el deploy", () => {
    expect(recoveryHttpResponse("GET", "/health")).toEqual({
      status: 200,
      body: { success: true, data: { status: "ok", db: "waiting" } },
    });
    expect(recoveryHttpResponse("GET", "/health?x=1").status).toBe(200);
  });

  it("responde 503 en el resto mientras Postgres no acepta", () => {
    expect(recoveryHttpResponse("POST", "/auth/login")).toEqual({
      status: 503,
      body: { success: false, message: DB_RESTARTING_MESSAGE },
    });
  });

  it("responde 204 en OPTIONS (CORS preflight)", () => {
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

  it("no traduce errores de negocio o migraciones rotas", () => {
    expect(dbOutageStatus("password authentication failed")).toBeNull();
    expect(dbOutageStatus("Migration failed to apply cleanly")).toBeNull();
  });
});

describe("isDbUnhealthy", () => {
  it("marca waiting y down", () => {
    expect(isDbUnhealthy("ok")).toBe(false);
    expect(isDbUnhealthy("waiting")).toBe(true);
    expect(isDbUnhealthy("down")).toBe(true);
    expect(isDbUnhealthy(undefined)).toBe(false);
  });

  it("expone mensajes distintos para waiting vs down", () => {
    expect(DB_RESTARTING_MESSAGE).toMatch(/reiniciando/i);
    expect(DB_DOWN_MESSAGE).toMatch(/no está disponible/i);
  });
});
