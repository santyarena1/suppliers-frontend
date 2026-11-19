import type { AccountDetailItem, AccountDetailLine } from "@/components/account/AccountRowDetail";
import { taxBreakdownLines, taxFromDraft } from "@/components/account/accountTaxBreakdown";
import type { NodoProviderDraft } from "@/lib/api";
import { draftStatus, fmtNodoDateTime } from "@/lib/accountFormat";
import { friendlyErrorMessage } from "@/lib/friendlyError";

export function draftLines(d: NodoProviderDraft): AccountDetailLine[] {
  return [
    { label: "Estado", value: draftStatus(d.status, "Creado").label },
    { label: "Pedido", value: d.invidOrderNumber || "" },
    { label: "Pedido web", value: d.invidWebOrderNumber || "" },
    { label: "Pago", value: d.paymentLabel || "" },
    { label: "Entrega", value: d.deliveryLabel || "" },
    { label: "Notas", value: d.notes || "" },
    { label: "Fecha", value: d.createdAt ? fmtNodoDateTime(d.createdAt) : "" },
    { label: "Error", value: d.errorMessage ? friendlyErrorMessage(d.errorMessage) : "" },
  ];
}

export function draftTotals(d: NodoProviderDraft): AccountDetailLine[] {
  return taxBreakdownLines(taxFromDraft(d));
}

export function draftItems(d: NodoProviderDraft): AccountDetailItem[] {
  return (d.items ?? []).map((it) => ({
    code: it.code != null ? String(it.code) : undefined,
    name: String(it.name || it.code || "Ítem"),
    qty: it.qty ?? it.quantity,
    price: it.price ?? it.priceUsd,
    total: it.subtotal ?? it.total,
  }));
}
