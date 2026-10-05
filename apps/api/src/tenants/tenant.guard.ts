import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JwtPayload, PlanCapabilityKey } from "@nodo/shared";
import type { FastifyRequest } from "fastify";
import {
  ALLOW_WHEN_RESTRICTED_KEY,
  checkEntitlements,
  REQUIRED_CAPABILITY_KEY,
  REQUIRES_ACTIVE_SUBSCRIPTION_KEY,
} from "./entitlements";
import { TenantContextService, type TenantContext } from "./tenant-context.service";
import { COST_CAPABILITIES, COST_SENSITIVE_KEY, assertCostVisible } from "../pricing/cost-visibility";

export type RequestWithTenant = FastifyRequest & {
  user?: JwtPayload;
  tenant?: TenantContext | null;
};

/**
 * Deja la organización de quien hace el pedido colgada del request, para que
 * `@CurrentTenant()` la lea sin volver a la base.
 *
 * No rechaza por falta de organización: un ROLE_ADMIN sin membresía no pertenece
 * a ninguna y tiene que poder usar los endpoints que no la necesitan. Quien sí la
 * necesite la pide con `@CurrentTenant()`, que es el que falla si no hay.
 *
 * Sí rechaza por plan (docs/PLAN_SUSCRIPCIONES.md): un comercio suspendido no
 * escribe, y un endpoint marcado con `@RequiresCapability` exige que el plan lo
 * incluya. Distribuidores, marcas y el superadmin en su sesión no tienen plan.
 *
 * Y corta por modo vendedor: una ruta de costos (`@CostSensitive` o de compra y
 * cuenta corriente) no es para quien solo ve precios de venta.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    request.tenant = request.user ? await this.tenantContext.fromSession(request.user) : null;
    const targets = [context.getHandler(), context.getClass()];
    const capability = this.reflector.getAllAndOverride<PlanCapabilityKey | undefined>(REQUIRED_CAPABILITY_KEY, targets);
    checkEntitlements(request.tenant, {
      method: request.method,
      capability,
      allowWhenRestricted: this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHEN_RESTRICTED_KEY, targets),
      requiresActive: this.reflector.getAllAndOverride<boolean | undefined>(REQUIRES_ACTIVE_SUBSCRIPTION_KEY, targets),
    });
    // Modo vendedor: quien no ve costos no entra a compras, cuenta corriente ni nada que los use.
    const costSensitive =
      this.reflector.getAllAndOverride<boolean | undefined>(COST_SENSITIVE_KEY, targets) ||
      (capability != null && COST_CAPABILITIES.includes(capability));
    if (costSensitive) assertCostVisible(request.tenant);
    return true;
  }
}
