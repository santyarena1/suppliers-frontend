import { createParamDecorator, ExecutionContext, ForbiddenException } from "@nestjs/common";
import type { TenantContext } from "../../tenants/tenant-context.service";
import type { RequestWithTenant } from "../../tenants/tenant.guard";

/**
 * La organización de quien hace el pedido. Requiere `TenantGuard` en el controlador.
 *
 * Falla si la persona no pertenece a ninguna, que es justo el caso del superadmin:
 * sus datos no son de nadie, así que no puede cargar credenciales ni comprar. Para
 * eso está "entrar como", que le da la sesión de alguien que sí tiene organización.
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
