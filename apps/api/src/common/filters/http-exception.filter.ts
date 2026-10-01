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
    } else if (clientFastifyError(exception)) {
      // Errores de Fastify del lado del cliente (no es multipart, archivo muy grande…): no son un 500.
      status = HttpStatus.BAD_REQUEST;
      message = fastifyClientMessage(String(exception.code));
      code = String(exception.code);
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

type FastifyClientError = Error & { code: string; statusCode: number };

function clientFastifyError(exception: unknown): exception is FastifyClientError {
  if (!(exception instanceof Error)) return false;
  const { code, statusCode } = exception as Partial<FastifyClientError>;
  return typeof code === "string" && code.startsWith("FST_") && typeof statusCode === "number" && statusCode >= 400 && statusCode < 500;
}

function fastifyClientMessage(code: string): string {
  if (code === "FST_INVALID_MULTIPART_CONTENT_TYPE") return "Falta el archivo: mandalo como formulario (multipart)";
  if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_FILES_LIMIT" || code === "FST_PARTS_LIMIT") return "El archivo es demasiado grande";
  return "El pedido no tiene el formato esperado";
}
