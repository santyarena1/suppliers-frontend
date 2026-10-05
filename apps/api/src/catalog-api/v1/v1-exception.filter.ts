import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ApiUsageService } from "../auth/api-usage.service";
import type { ApiRequest } from "../auth/api-principal";
import { requestIp } from "../auth/request-ip";
import { ApiError, DOCS_URL } from "../core/api-error";
import { InvalidCursorError } from "../core/cursor";
import { requestId } from "../core/ids";

/** Errores genéricos de Nest/Fastify llevados a los códigos públicos. */
const CODE_BY_STATUS: Record<number, string> = {
  400: "invalid_parameter",
  401: "invalid_credentials",
  403: "insufficient_scope",
  404: "not_found",
  405: "not_found",
  413: "invalid_parameter",
  415: "invalid_parameter",
  422: "invalid_parameter",
  429: "rate_limited",
};

/**
 * Errores de /v1 en el formato público:
 * `{ "error": { "code", "message", "requestId", "docs", "details"? } }`.
 * Nunca se filtra un stack ni un mensaje interno: los 500 dicen solo eso.
 */
@Catch()
export class V1ExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("CatalogApi");

  constructor(private readonly usage: ApiUsageService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<ApiRequest>();
    const id = (request.apiRequestId ??= requestId());

    let status = 500;
    let code = "internal_error";
    let message = "Error interno. Si se repite, escribinos con el requestId.";
    let details: Record<string, unknown> | undefined;
    let headers: Record<string, string> = {};

    if (exception instanceof ApiError) {
      ({ status, code, message, headers } = exception);
      details = exception.details;
    } else if (exception instanceof InvalidCursorError) {
      status = 400;
      code = "invalid_cursor";
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = CODE_BY_STATUS[status] ?? (status >= 500 ? "internal_error" : "invalid_parameter");
      const body = exception.getResponse();
      if (typeof body === "string") message = body;
      else if (body && typeof body === "object") {
        const m = (body as { message?: string | string[] }).message;
        if (Array.isArray(m)) {
          code = "invalid_parameter";
          message = "Hay parámetros inválidos.";
          details = { errors: m };
        } else if (m) message = m;
      }
    } else {
      this.logger.error(`[${id}] ${(exception as Error)?.message ?? exception}`, (exception as Error)?.stack);
    }

    if (request.apiPrincipal) this.usage.record(request.apiPrincipal.clientId, false, requestIp(request));
    for (const [name, value] of Object.entries(headers)) reply.header(name, value);
    reply
      .header("X-Request-Id", id)
      .status(status)
      .send({ error: { code, message, requestId: id, docs: `${DOCS_URL}#errores`, ...(details ? { details } : {}) } });
  }
}
