import type { AccountDetailItem, AccountDetailLine } from "@/components/account/AccountRowDetail";
import {
  emptyIvaAcc,
  addIva,
  round2,
  taxBreakdownLines,
} from "@/components/account/accountTaxBreakdown";
import type { SolutionBoxOrder } from "@/lib/api";

const EPS = 0.005;

/**
 * Desglose impositivo de un pedido de Solution Box.
 *
 * El portal manda los ítems con su precio y, aparte, el importe del pedido: la
 * diferencia entre la suma de líneas y ese importe es la carga impositiva. No
 * viene discriminada, así que se reparte por alícuota mirando cuánto representa
 * sobre el neto, igual que se hace con los otros proveedores que mandan el IVA
 * en un solo número.
 *
 * Antes el detalle mostraba las dos cifras sin ninguna relación entre sí: los
 * ítems sumaban $6.677.321 y el importe decía $7.508.409, sin explicar el resto.
 */
export function sbOrderTotals(order: SolutionBoxOrder): AccountDetailLine[] {
  const net = round2(
    order.items.reduce((acc, it) => acc + (it.price ?? 0) * (it.qty ?? 0), 0)
  );
  const total = order.amount;
  if (!(net > EPS)) return [];

  const currency = order.currency ?? undefined;
  if (total == null || !Number.isFinite(total) || total <= net + EPS) {
    // Sin importe mayor al neto no hay impuesto que mostrar: se informa el neto
    // y se deja de inventar el resto.
    return taxBreakdownLines({ net, currency, total: total ?? undefined });
  }

  const carga = round2(total - net);
  const acc = emptyIvaAcc();
  addIva(acc, net, carga);
  return taxBreakdownLines({
    net,
    iva105: acc.iva105,
    iva21: acc.iva21,
    ivaOther: acc.ivaOther,
    currency,
    total,
  });
}

/**
 * Los ítems, con el nombre que el portal informe.
 *
 * Solution Box identifica el producto por su alias; cuando no manda
 * descripción, el alias es todo lo que hay, y repetirlo en las dos columnas
 * solo ocupa lugar.
 */
export function sbOrderItems(order: SolutionBoxOrder): AccountDetailItem[] {
  return order.items.map((it) => {
    const name = it.name?.trim();
    return {
      code: it.code,
      name: name && name !== it.code ? name : "",
      qty: it.qty,
      price: it.price ?? undefined,
      total: it.price != null ? round2(it.price * (it.qty ?? 0)) : undefined,
    };
  });
}
