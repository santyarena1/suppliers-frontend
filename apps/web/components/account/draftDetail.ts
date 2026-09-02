import type { AccountDetailItem, AccountDetailLine } from "@/components/account/AccountRowDetail";
import { taxBreakdownLines, taxFromDraft } from "@/components/account/accountTaxBreakdown";
import type { NodoProviderDraft } from "@/lib/api";

export function draftLines(d: NodoProviderDraft): AccountDetailLine[] {
  return [
    { label: "Estado", value: d.status === "CREATED" ? "Creado" : d.status },
    { label: "Pedido", value: d.invidOrderNumber || "" },
    { label: "Pedido web", value: d.invidWebOrderNumber || "" },
    { label: "Pago", value: d.paymentLabel || "" },
    { label: "Entrega", value: d.deliveryLabel || "" },
    { label: "Notas", value: d.notes || "" },
    { label: "Fecha", value: d.createdAt ? new Date(d.createdAt).toLocaleString("es-AR") : "" },
    { label: "Error", value: d.errorMessage || "" },
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
