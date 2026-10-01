import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger, Optional } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { RequestMetricsService } from "../../monitoring/request-metrics.service";
import type { ApiFailure, ApiFieldError } from "@nodo/shared";
import { dbOutageStatus } from "../../prisma/recovery-gate";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(@Optional() private readonly metrics?: RequestMetricsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Error interno del servidor";
    let errors: ApiFieldError[] | undefined;
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === "string") {
        message = response;
      } else if (typeof response === "object" && response !== null) {
        const body = response as { message?: string | string[]; error?: string; code?: unknown; details?: unknown };
        if (Array.isArray(body.message)) {
          message = "Error de validación";
          errors = body.message.map((m) => ({ field: "unknown", message: m }));
        } else {
          message = body.message ?? body.error ?? message;
        }
        if (typeof body.code === "string") code = body.code;
        if (body.details && typeof body.details === "object") details = body.details as Record<string, unknown>;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      const code = "code" in exception && exception.code != null ? String(exception.code) : "";
      const outage = dbOutageStatus(`${code} ${exception.message}`);
      if (outage) {
        status = outage.status;
        message = outage.message;
      }
    } else {
      this.logger.error("Excepción no controlada", String(exception));
    }

    const body: ApiFailure = {
      success: false,
      message,
      ...(errors ? { errors } : {}),
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
    };
    if (status >= 500) this.recordServerError(ctx.getRequest<FastifyRequest>(), status, exception, message);
    reply.status(status).send(body);
  }

  /** Los errores internos quedan guardados para "Salud del sistema", con el mensaje real. */
  private recordServerError(req: FastifyRequest, status: number, exception: unknown, message: string) {
    if (!this.metrics) return;
    const user = (req as { user?: { userId?: string; tenantId?: string } }).user;
    this.metrics.recordError({
      method: req.method,
      route: (req as { routeOptions?: { url?: string } }).routeOptions?.url || req.url.split("?")[0],
      status,
      message: exception instanceof Error ? exception.message : message,
      userId: user?.userId ?? null,
      tenantId: user?.tenantId ?? null,
    });
  }
}
