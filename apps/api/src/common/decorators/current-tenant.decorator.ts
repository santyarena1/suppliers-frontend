import { createParamDecorator, ExecutionContext, ForbiddenException } from "@nestjs/common";
import type { TenantContext } from "../../tenants/tenant-context.service";
import type { RequestWithTenant } from "../../tenants/tenant.guard";

/**
 * La organización de quien hace el pedido. Requiere `TenantGuard` en el controlador.
 *
 * Falla si la persona no pertenece a ninguna. El superadmin de prueba opera el
 * Comercio de Pruebas y sí tiene organización: mismas credenciales de proveedor
 * que testuser1, sin "entrar como". Un ROLE_ADMIN sin membresía sigue sin poder
 * cargar credenciales ni comprar.
 */
export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): TenantContext => {
  const request = ctx.switchToHttp().getRequest<RequestWithTenant>();
  if (!request.tenant) {
    throw new ForbiddenException(
      "Tu usuario no pertenece a ninguna organización. Pedile a un administrador que te asigne una."
    );
  }
  return request.tenant;
});

/**
 * Igual que `CurrentTenant`, pero devuelve `null` en vez de cortar.
 *
 * Para las lecturas del catálogo: no tener organización no es un error, es no tener
 * catálogo. El endpoint responde vacío, que es la verdad.
 */
export const CurrentTenantOrNone = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext | null =>
    ctx.switchToHttp().getRequest<RequestWithTenant>().tenant ?? null
);
