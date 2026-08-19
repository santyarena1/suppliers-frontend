import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { ApiFailure, ApiFieldError } from "@nodo/shared";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Error interno del servidor";
    let errors: ApiFieldError[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === "string") {
        message = response;
      } else if (typeof response === "object" && response !== null) {
        const body = response as { message?: string | string[]; error?: string };
        if (Array.isArray(body.message)) {
          message = "Error de validación";
          errors = body.message.map((m) => ({ field: "unknown", message: m }));
        } else {
          message = body.message ?? body.error ?? message;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error("Excepción no controlada", String(exception));
    }

    const body: ApiFailure = { success: false, message, ...(errors ? { errors } : {}) };
    reply.status(status).send(body);
  }
}
