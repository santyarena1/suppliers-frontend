import { Global, Module } from "@nestjs/common";
import { MonitoringController } from "./monitoring.controller";
import { RequestMetricsService } from "./request-metrics.service";
import { SystemHealthService } from "./system-health.service";

/** Global: el filtro de errores y el hook de respuestas registran métricas desde cualquier módulo. */
@Global()
@Module({
  controllers: [MonitoringController],
  providers: [RequestMetricsService, SystemHealthService],
  exports: [RequestMetricsService],
})
export class MonitoringModule {}
