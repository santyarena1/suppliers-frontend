// Integración contra Postgres real. Se salta sin INTEGRATION_DB.
import { PrismaClient } from "@prisma/client";
import { RequestMetricsService } from "./request-metrics.service";
import { SystemHealthService } from "./system-health.service";

const url = process.env.INTEGRATION_DB;
const d = url ? describe : describe.skip;

d("SystemHealthService contra Postgres", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? "postgresql://skip@localhost/skip" } } });
  const metrics = new RequestMetricsService(prisma as never);
  const health = new SystemHealthService(prisma as never, metrics);

  afterAll(async () => {
    await prisma.apiMetric.deleteMany({ where: { route: { startsWith: "/health-test" } } });
    await prisma.apiErrorEvent.deleteMany({ where: { route: { startsWith: "/health-test" } } });
    await prisma.$disconnect();
  });

  it("registra métricas y errores y arma el panel completo", async () => {
    metrics.record("GET", "/health-test/ok", 200, 40);
    metrics.record("GET", "/health-test/ok", 200, 60);
    metrics.record("GET", "/health-test/falla", 500, 120);
    metrics.recordError({ method: "GET", route: "/health-test/falla", status: 500, message: "boom de prueba" });

    const view = await health.overview("2");

    expect(view.traffic.requests).toBeGreaterThanOrEqual(3);
    expect(view.traffic.serverErrors).toBeGreaterThanOrEqual(1);
    expect(view.recentErrors.some((e) => e.message === "boom de prueba")).toBe(true);
    // Todos los chequeos corren contra el esquema real (ninguno con error de SQL).
    expect(view.integrity.length).toBeGreaterThanOrEqual(10);
    expect(view.integrity.every((c) => !c.hint.startsWith("No se pudo correr"))).toBe(true);
    expect(["ok", "warning", "critical"]).toContain(view.status.level);
    expect(view.runtime.dbLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("suma en la misma fila si la ruta y la hora coinciden", async () => {
    metrics.record("GET", "/health-test/suma", 200, 10);
    await metrics.flush();
    metrics.record("GET", "/health-test/suma", 200, 30);
    await metrics.flush();
    const rows = await prisma.apiMetric.findMany({ where: { route: "/health-test/suma" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ count: 2, totalMs: 40, maxMs: 30 });
  });
});
