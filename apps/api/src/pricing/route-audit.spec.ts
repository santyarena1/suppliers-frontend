import { PATH_METADATA } from "@nestjs/common/constants";
import { CartController } from "../cart/cart.controller";
import { ListImportController } from "../list-import/list-import.controller";
import { OrdersController } from "../orders/orders.controller";
import { ProvidersController } from "../providers/providers.controller";
import { REQUIRED_CAPABILITY_KEY } from "../tenants/entitlements";
import { COST_CAPABILITIES, COST_SENSITIVE_KEY } from "./cost-visibility";
import { SALE_PRICED_KEY } from "./sale-pricing.interceptor";

/**
 * Auditoría del modo vendedor (docs/PLAN_MODO_VENDEDOR.md §3): cada ruta que
 * devuelve precios del catálogo lleva precio de venta, y cada ruta de compra,
 * borradores o cuenta corriente queda cerrada para quien no ve costos.
 */
type Route = { name: string; path: string; salePriced?: string; costSensitive?: boolean; capability?: string };

function routes(controller: { prototype: object }): Route[] {
  const proto = controller.prototype as Record<string, unknown>;
  const classCost = Reflect.getMetadata(COST_SENSITIVE_KEY, controller) as boolean | undefined;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== "constructor" && typeof proto[name] === "function")
    .map((name) => {
      const handler = proto[name] as object;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const own = Reflect.getMetadata(COST_SENSITIVE_KEY, handler) as boolean | undefined;
      return {
        name,
        path: path ?? "",
        salePriced: Reflect.getMetadata(SALE_PRICED_KEY, handler) as string | undefined,
        costSensitive: own ?? classCost,
        capability: Reflect.getMetadata(REQUIRED_CAPABILITY_KEY, handler) as string | undefined,
      };
    })
    .filter((r) => r.path !== "");
}

const blocked = (r: Route) => r.costSensitive === true || (r.capability != null && COST_CAPABILITIES.includes(r.capability as never));

describe("auditoría de rutas con precios", () => {
  const providerRoutes = routes(ProvidersController);

  it.each([
    "search/provider/:provider",
    "providers/:provider/catalog",
    "providers/:provider/products/:externalId",
    "catalog/featured",
    "catalog/by-category",
    "catalog/by-provider",
    "catalog/by-brand",
  ])("%s lleva precio de venta", (path) => {
    expect(providerRoutes.find((r) => r.path === path)?.salePriced).toBe("catalog");
  });

  it("el historial de precios pasa a venta para el vendedor", () => {
    expect(providerRoutes.find((r) => r.path === "providers/:provider/products/:externalId/price-history")?.salePriced).toBe("history");
  });

  it("borradores, checkout, cuenta corriente y detalle de sync quedan cerrados", () => {
    const sensitive = providerRoutes.filter(
      (r) => /\/(drafts|checkout|account|orders|documents|payments|salenotes|purchase-orders|profile)/.test(r.path) || r.path.endsWith("sync/runs/:id")
    );
    expect(sensitive.length).toBeGreaterThan(40);
    const open = sensitive.filter((r) => !blocked(r)).map((r) => r.path);
    expect(open).toEqual([]);
  });

  it.each([
    ["carrito", CartController],
    ["pedidos", OrdersController],
    ["listas de precios", ListImportController],
  ])("%s: todo cerrado salvo lo liberado a propósito", (_label, controller) => {
    const list = routes(controller as never);
    const open = list.filter((r) => !blocked(r)).map((r) => r.path);
    expect(open).toEqual(controller === ListImportController ? ["providers/:provider/freshness"] : []);
  });
});
