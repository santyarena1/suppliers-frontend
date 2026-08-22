import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { ApiSuccess } from "@nodo/shared";

@Injectable()
export class ResponseInterceptor implements NestInterceptor<unknown, unknown> {
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile) return data;
        if (Buffer.isBuffer(data)) return data;
        // Streams / buffers (ej. exports en Excel) ya vienen resueltos por el propio handler.
        if (data && typeof data === "object" && "__raw" in (data as Record<string, unknown>)) {
          return (data as { __raw: unknown }).__raw;
        }
        const body: ApiSuccess<unknown> = { success: true, data: data ?? null };
        return body;
      })
    );
  }
}
