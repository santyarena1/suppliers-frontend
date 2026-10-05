import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { from, Observable, switchMap } from "rxjs";
import type { RequestWithTenant } from "../tenants/tenant.guard";
import { commercialId } from "../tenants/tenant-context.service";
import { PrismaService } from "../prisma/prisma.service";
import { fichaRaw } from "../providers/catalog-view";
import { hidesCost, sellerModeOn } from "./cost-visibility";
import { SaleMarginRulesService } from "./sale-margin-rules.service";
import { applySalePricing, saleHistory } from "./sale-pricing";

export const SALE_PRICED_KEY = "salePriced";
export type SalePricedMode = "catalog" | "history";

/**
 * La respuesta lleva precio de venta (modo vendedor). `history` es el historial
 * de precios de un producto (`:provider/:externalId` en la ruta).
 */
export const SalePriced = (mode: SalePricedMode = "catalog") => SetMetadata(SALE_PRICED_KEY, mode);

/**
 * Aplica el modo vendedor a las rutas marcadas con `@SalePriced`. Corre después
 * del TenantGuard, así que el comercio y los permisos ya están en el request.
 * Sin el modo en el plan, la respuesta pasa tal cual.
 */
@Injectable()
export class SalePricingInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly rules: SaleMarginRulesService,
    private readonly prisma: PrismaService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const mode = this.reflector.getAllAndOverride<SalePricedMode | undefined>(SALE_PRICED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<RequestWithTenant & { params?: Record<string, string> }>();
    const tenant = request.tenant;
    if (!mode || !tenant || !sellerModeOn(tenant)) return next.handle();
    const hideCost = hidesCost(tenant);
    const tenantId = commercialId(tenant);

    return next.handle().pipe(
      switchMap((body) =>
        from(
          (async () => {
            const rules = await this.rules.get(tenantId);
            if (mode === "history") {
              if (!hideCost || !Array.isArray(body)) return body;
              return this.history(tenantId, body, request.params ?? {}, rules);
            }
            return applySalePricing(body, { rules, hideCost });
          })()
        )
      )
    );
  }

  /** Historial para quien no ve costos: la serie pasa a venta con el margen de hoy. */
  private async history(
    tenantId: string,
    points: { price: unknown; finalPrice: unknown }[],
    params: Record<string, string>,
    rules: Awaited<ReturnType<SaleMarginRulesService["get"]>>
  ) {
    const provider = (params.provider ?? "").toUpperCase();
    const externalId = params.externalId ?? "";
    const product = await this.prisma.providerSyncCache.findUnique({
      where: { provider_externalId: { provider, externalId } },
      select: { category: true, raw: true },
    });
    const offerIva = points.length
      ? await this.prisma.tenantProductOffer.findFirst({
          where: { tenantId, provider, externalId },
          select: { ivaPercent: true },
        })
      : null;
    return saleHistory(
      points,
      {
        provider,
        externalId,
        category: product?.category ?? null,
        ivaPercent: offerIva?.ivaPercent ?? null,
        raw: fichaRaw(provider, product?.raw ?? null),
      },
      rules
    );
  }
}
