import type { CartItem, CartScheme } from "@/lib/cart";
import type { PurchasePolicy } from "@/lib/purchase-pricing";
import { purchaseLinePricing, priceModeForCartItem } from "@/lib/purchase-price";
import { IVA_ADJUSTMENT_LABELS } from "@/lib/purchase-pricing";

function providerLabel(provider: string) {
  return provider.replace(/_/g, " ");
}

export function buildSellerMessage(opts: {
  scopeProvider?: string;
  items: CartItem[];
  schemes: CartScheme[];
  policies: Record<string, PurchasePolicy>;
  fmt: (usd: number, digits?: number) => string;
}): string {
  const { scopeProvider, schemes, policies, fmt } = opts;
  const items = scopeProvider ? opts.items.filter((it) => it.provider === scopeProvider) : opts.items;
  if (items.length === 0) return "";

  const providers = [...new Set(items.map((it) => it.provider))];
  const lines: string[] = [];
  const allOffline = items.every((it) => it.channel === "offline");
  const allOnline = items.every((it) => it.channel !== "offline");

  if (allOffline) {
    lines.push("Pedido offline NODO");
    lines.push("Compra sin facturar. Este pedido no se carga en el portal: copiá y mandáselo al vendedor.");
  } else if (allOnline) {
    lines.push("Pedido online NODO");
    lines.push("Al portal van todos los ítems sueltos. Este texto es para el vendedor (con/sin esquema).");
  } else {
    lines.push("Pedido NODO");
  }
  lines.push(new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }));
  lines.push("");

  for (const provider of providers) {
    const policy = policies[provider];
    const group = items.filter((it) => it.provider === provider);
    lines.push(`*${providerLabel(provider)}*`);
    if (group.some((it) => it.channel === "offline") && policy?.ivaAdjustment) {
      lines.push(`IVA: ${IVA_ADJUSTMENT_LABELS[policy.ivaAdjustment]}`);
    }
    const offline = group.filter((it) => it.channel === "offline");
    const online = group.filter((it) => it.channel !== "offline");

    if (offline.length) {
      if (online.length) lines.push("Pedido offline:");
      pushItems(lines, offline, policy, fmt);
    }

    if (online.length) {
      const loose = online.filter((it) => !it.schemeId);
      const schemeIds = [...new Set(online.map((it) => it.schemeId).filter(Boolean))] as string[];
      if (loose.length) {
        lines.push("Sin esquema:");
        pushItems(lines, loose, policy, fmt);
      }
      for (const id of schemeIds) {
        const scheme = schemes.find((s) => s.id === id);
        const name = scheme?.name || "Esquema";
        const disc = policy?.schemeDiscountPercent;
        const discBit = disc ? ` (desc. ${formatPct(disc)})` : "";
        lines.push(`${name}${discBit}:`);
        pushItems(lines, online.filter((it) => it.schemeId === id), policy, fmt);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function formatPct(n: number) {
  const r = Math.round(n * 10) / 10;
  return `${Number.isInteger(r) ? String(r) : r.toFixed(1)}%`;
}

function pushItems(
  lines: string[],
  items: CartItem[],
  policy: PurchasePolicy | undefined,
  fmt: (usd: number, digits?: number) => string
) {
  for (const it of items) {
    const pricing = purchaseLinePricing(it, policy, priceModeForCartItem(it), it.qty);
    const name = it.name.length > 80 ? `${it.name.slice(0, 77)}...` : it.name;
    const qtyBit = it.qty > 1 ? ` x${it.qty}` : "";
    const warn = pricing.missingIva ? " ⚠ sin alícuota de IVA" : "";
    lines.push(`• ${name}${qtyBit}  →  ${fmt(pricing.gross, 2)}${warn}`);
  }
}
