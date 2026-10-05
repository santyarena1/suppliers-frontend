"use client";

import type { ProductDTO } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { usePrefs } from "@/lib/prefs";
import { useIsRetailer } from "@/lib/purchase";
import { useSubscription } from "@/lib/subscription";
import type { SaleMarginSource } from "@/lib/sale-margins";

/**
 * Modo vendedor en pantalla (docs/PLAN_MODO_VENDEDOR.md §3 y §5).
 *
 * El servidor decide qué ve cada uno: a quien no tiene `prices.viewCost` le
 * manda la venta en lugar del costo (`viewerMode: "seller"`). Acá solo se
 * elige cómo mostrarlo y se arma "Ver como vendedor" para quien sí ve costos.
 */
export interface SellerSession {
  /** El plan del comercio tiene modo vendedor. */
  sellerMode: boolean;
  /** `null` mientras se sabe. */
  canSeeCost: boolean | null;
  /** Vendedor de verdad: no ve costos. */
  isSeller: boolean;
  /** La pantalla se muestra como la ve un vendedor (vendedor o "Ver como vendedor"). */
  viewingAsSeller: boolean;
  /** Puede activar "Ver como vendedor". */
  canPreviewAsSeller: boolean;
}

export function useSellerSession(): SellerSession {
  const retailer = useIsRetailer();
  const { subscription } = useSubscription();
  const canSeeCost = useCan("prices.viewCost");
  const { viewAsSeller } = usePrefs();
  // Solo con la respuesta real del plan: sin suscripción cargada no se asume nada.
  const sellerMode = Boolean(
    retailer && subscription && subscription.access === "FULL" && subscription.capabilities?.sellerMode
  );
  const isSeller = sellerMode && canSeeCost === false;
  const canPreviewAsSeller = sellerMode && canSeeCost === true;
  return {
    sellerMode,
    canSeeCost,
    isSeller,
    viewingAsSeller: isSeller || (canPreviewAsSeller && viewAsSeller),
    canPreviewAsSeller,
  };
}

export type SalePresentation =
  /** Como siempre: el costo. */
  | { mode: "cost" }
  /** Costo como precio principal y la venta al lado. */
  | { mode: "cost+sale"; saleUsd: number; marginPercent: number | null; source: SaleMarginSource | null }
  /** Solo la venta (vendedor, o "Ver como vendedor"). */
  | { mode: "sale"; saleUsd: number | null; marginPercent: number | null; forced: boolean };

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Importe de venta en USD según se muestre con o sin IVA. */
export function saleAmountUsd(product: Pick<ProductDTO, "sale" | "price" | "finalPrice" | "viewerMode">, withIva: boolean): number | null {
  const sale = product.sale;
  if (sale) {
    const final = num(sale.finalPrice);
    const net = num(sale.price);
    const amount = withIva ? final ?? net : net ?? final;
    if (amount != null) return amount;
  }
  // Vendedor: el servidor ya puso la venta en price/finalPrice.
  if (product.viewerMode === "seller") {
    const final = num(product.finalPrice);
    const net = num(product.price);
    return withIva ? final ?? net : net ?? final;
  }
  return null;
}

/** Cómo mostrar el precio de un producto para esta sesión. */
export function salePresentation(
  product: Pick<ProductDTO, "sale" | "price" | "finalPrice" | "viewerMode">,
  session: Pick<SellerSession, "viewingAsSeller">,
  withIva: boolean
): SalePresentation {
  if (product.viewerMode === "seller") {
    return {
      mode: "sale",
      saleUsd: saleAmountUsd(product, withIva),
      marginPercent: product.sale?.marginPercent ?? null,
      forced: true,
    };
  }
  const saleUsd = saleAmountUsd(product, withIva);
  if (!product.sale || saleUsd == null) return { mode: "cost" };
  if (session.viewingAsSeller) {
    return { mode: "sale", saleUsd, marginPercent: product.sale.marginPercent, forced: false };
  }
  return { mode: "cost+sale", saleUsd, marginPercent: product.sale.marginPercent, source: product.sale.source };
}

/** Atajo para componentes de producto. */
export function useSalePresentation(product: Pick<ProductDTO, "sale" | "price" | "finalPrice" | "viewerMode">): SalePresentation {
  const session = useSellerSession();
  const { withIva } = usePrefs();
  return salePresentation(product, session, withIva);
}
