import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { JwtPayload } from "@nodo/shared";
import type { FastifyRequest } from "fastify";
import { TenantContextService, type TenantContext } from "./tenant-context.service";

export type RequestWithTenant = FastifyRequest & {
  user?: JwtPayload;
  tenant?: TenantContext | null;
};

/**
 * Deja la organización de quien hace el pedido colgada del request, para que
 * `@CurrentTenant()` la lea sin volver a la base.
 *
 * Nunca rechaza: un ROLE_ADMIN sin membresía no pertenece a ninguna organización
 * y tiene que poder usar los endpoints que no la necesitan. Quien sí la necesite
 * la pide con `@CurrentTenant()`, que es el que falla si no hay.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    request.tenant = request.user ? await this.tenantContext.fromSession(request.user) : null;
    return true;
  }
}
