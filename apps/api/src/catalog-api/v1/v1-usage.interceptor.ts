import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { ApiUsageService } from "../auth/api-usage.service";
import type { ApiRequest } from "../auth/api-principal";
import { requestIp } from "../auth/request-ip";

/** Cuenta cada pedido exitoso de la key (los errores los cuenta el filtro). */
@Injectable()
export class V1UsageInterceptor implements NestInterceptor {
  constructor(private readonly usage: ApiUsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    return next.handle().pipe(
      tap(() => {
        if (request.apiPrincipal) this.usage.record(request.apiPrincipal.clientId, true, requestIp(request));
      })
    );
  }
}
