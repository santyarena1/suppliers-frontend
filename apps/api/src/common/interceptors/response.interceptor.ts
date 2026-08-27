import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { ApiSuccess } from "@nodo/shared";
import { SKIP_ENVELOPE_KEY } from "../decorators/skip-envelope.decorator";

@Injectable()
export class ResponseInterceptor implements NestInterceptor<unknown, unknown> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile) return data;
        if (Buffer.isBuffer(data)) return data;
        if (data && typeof data === "object" && "__raw" in (data as Record<string, unknown>)) {
          return (data as { __raw: unknown }).__raw;
        }
        const body: ApiSuccess<unknown> = { success: true, data: data ?? null };
        return body;
      })
    );
  }
}
