"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ShoppingCart, ChevronUp, X, Minus, Plus, Package } from "lucide-react";
import { useCart, type CartItem, type CartRef, cartItemKey } from "@/lib/cart";
import { PROVIDER_LABELS, type Provider } from "@/lib/api";
import { useProviderDisplay } from "@/lib/providerDisplay";
import { proxyImg, formatUSD, formatARS } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { usePurchasePolicy, usePurchasePolicies } from "@/lib/purchase";
import { purchaseLinePricing, priceModeForCartItem } from "@/lib/purchase-price";
import { displayAmountFromPricing } from "@/lib/display-price";
import { taxByKind, formatAlicuota, type TaxLine } from "@/lib/tax";
import { getIibbRatePercent, useIibbRatesEpoch } from "@/lib/iibb-rates";
import type { PurchasePolicy } from "@/lib/purchase-pricing";

type BreakdownRow = { key: string; label: string; amountUsd: number };

type LineBreakdown = {
  rows: BreakdownRow[];
  totalUsd: number;
  unitNetUsd: number;
  qty: number;
};

function buildCartLineBreakdown(
  item: CartItem,
  policy: PurchasePolicy | null | undefined,
  withIva: boolean,
  withIibb: boolean,
): LineBreakdown {
  const pricing = purchaseLinePricing(item, policy, priceModeForCartItem(item), item.qty);
  const includeIibb = withIibb && pricing.mode !== "offline";
  const qty = item.qty;
  const rows: BreakdownRow[] = [{ key: "net", label: "Neto", amountUsd: pricing.net }];

  if (withIva) {
    const taxLines = pricing.lines;
    const iva = taxByKind(taxLines, "iva");
    const internos = taxByKind(taxLines, "internos");
    let iibb: TaxLine | null = taxByKind(taxLines, "iibb");
    let iibbEstimated = false;

    if (includeIibb && (!iibb || iibb.unitAmount <= 0.0001)) {
      const pct = getIibbRatePercent(item.provider);
      if (pct != null && pct > 0 && pricing.unitNet > 0) {
        iibb = {
          kind: "iibb",
          label: "IIBB",
          percent: pct,
          unitAmount: Math.round(pricing.unitNet * (pct / 100) * 10000) / 10000,
        };
        iibbEstimated = true;
      }
    }

    if (iva && iva.unitAmount > 0.0001) {
      rows.push({
        key: "iva",
        label: `IVA ${formatAlicuota(iva.percent)}`,
        amountUsd: iva.unitAmount * qty,
      });
    }
    if (internos && internos.unitAmount > 0.0001) {
      rows.push({
        key: "internos",
        label: "Imp. internos",
        amountUsd: internos.unitAmount * qty,
      });
    }
    if (includeIibb && iibb && iibb.unitAmount > 0.0001) {
      rows.push({
        key: "iibb",
        label: `IIBB ${formatAlicuota(iibb.percent)}${iibbEstimated ? " est." : ""}`,
        amountUsd: iibb.unitAmount * qty,
      });
    }
    for (const line of taxLines.filter((l) => l.kind === "other" && l.unitAmount > 0.0001)) {
      rows.push({
        key: `other-${line.label}`,
        label: line.label,
        amountUsd: line.unitAmount * qty,
      });
    }
  }

  const totalUsd = displayAmountFromPricing(
    pricing,
    { withIva, withIibb: includeIibb, provider: item.provider },
    qty,
  ).displayUsd;

  return { rows, totalUsd, unitNetUsd: pricing.unitNet, qty };
}

function useMoneyFmt() {
  const { currency, convert } = usePrefs();
  return (usd: number) =>
    currency === "USD" ? formatUSD(usd) : formatARS(convert(usd).amount);
}

type ProviderGroup = {
  provider: string;
  label: string;
  items: CartItem[];
  qty: number;
};

function cartRef(item: CartItem): CartRef {
  return {
    provider: item.provider,
    externalId: item.externalId,
    channel: item.channel,
    schemeId: item.schemeId,
  };
}

function PreviewQty({ item }: { item: CartItem }) {
  const { setQty, remove } = useCart();
  const ref = cartRef(item);

  function dec(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (item.qty <= 1) remove(ref);
    else setQty(ref, item.qty - 1);
  }

  function inc(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setQty(ref, item.qty + 1);
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-surface-700 bg-surface-900 p-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={dec}
        className="flex h-6 w-6 items-center justify-center rounded text-surface-400 hover:bg-surface-800 hover:text-white transition-colors"
        aria-label="Quitar uno"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="min-w-[1.25rem] text-center text-[11px] font-semibold tabular-nums text-surface-100">
        {item.qty}
      </span>
      <button
        type="button"
        onClick={inc}
        className="flex h-6 w-6 items-center justify-center rounded text-brand-400 hover:bg-brand-600 hover:text-white transition-colors"
        aria-label="Agregar uno"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

function PreviewLinePrice({ item }: { item: CartItem }) {
  const policy = usePurchasePolicy(item.provider);
  const { withIva, withIibb } = usePrefs();
  useIibbRatesEpoch();
  const fmt = useMoneyFmt();
  const { rows, totalUsd, unitNetUsd, qty } = buildCartLineBreakdown(
    item,
    policy,
    withIva,
    withIibb,
  );

  const parts = rows.map((row) => {
    if (row.key === "net" && qty > 1) {
      return `Neto ${qty}×${fmt(unitNetUsd)}`;
    }
    return `${row.label} ${fmt(row.amountUsd)}`;
  });

  return (
    <div className="mt-1 flex items-start justify-between gap-2">
      <p
        className="min-w-0 flex-1 text-[10px] leading-snug text-surface-500 truncate tabular-nums"
        title={parts.join(" · ")}
      >
        {parts.join(" · ")}
      </p>
      <span className="flex-shrink-0 text-[12px] font-semibold tabular-nums text-white leading-snug text-right min-w-[4.5rem]">
        {fmt(totalUsd)}
      </span>
    </div>
  );
}

function PreviewLine({ item }: { item: CartItem }) {
  const href = `/product/${encodeURIComponent(item.provider)}/${encodeURIComponent(item.externalId)}`;

  return (
    <div className="flex items-start gap-2.5 py-2">
      <Link
        href={href}
        className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-surface-700 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {item.imageUrl ? (
          <Image
            src={proxyImg(item.imageUrl)}
            alt=""
            fill
            className="object-contain p-0.5"
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-surface-800 text-surface-500">
            <Package className="w-4 h-4" />
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={href}
            className="min-w-0 flex-1 block text-[12px] leading-snug text-surface-100 line-clamp-1 hover:text-white transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {item.name}
          </Link>
          <div className="flex-shrink-0 min-w-[4.5rem] flex justify-end">
            <PreviewQty item={item} />
          </div>
        </div>
        <PreviewLinePrice item={item} />
      </div>
    </div>
  );
}

function PreviewTotals({ items }: { items: CartItem[] }) {
  const policies = usePurchasePolicies();
  const { withIva, withIibb } = usePrefs();
  useIibbRatesEpoch();
  const fmt = useMoneyFmt();

  const summary = useMemo(() => {
    const totals = new Map<string, number>();
    let totalUsd = 0;

    for (const item of items) {
      const breakdown = buildCartLineBreakdown(
        item,
        policies[item.provider],
        withIva,
        withIibb,
      );
      totalUsd += breakdown.totalUsd;
      for (const row of breakdown.rows) {
        totals.set(row.key, (totals.get(row.key) ?? 0) + row.amountUsd);
      }
    }

    const rows: BreakdownRow[] = [];
    if (totals.has("net")) rows.push({ key: "net", label: "Neto", amountUsd: totals.get("net")! });
    if (withIva) {
      if (totals.has("iva")) rows.push({ key: "iva", label: "IVA", amountUsd: totals.get("iva")! });
      if (totals.has("internos")) {
        rows.push({ key: "internos", label: "Imp. internos", amountUsd: totals.get("internos")! });
      }
      if (totals.has("iibb")) rows.push({ key: "iibb", label: "IIBB", amountUsd: totals.get("iibb")! });
    }

    return { rows, totalUsd };
  }, [items, policies, withIva, withIibb]);

  if (items.length === 0) return null;

  const detail = summary.rows.map((row) => `${row.label} ${fmt(row.amountUsd)}`).join(" · ");

  return (
    <div className="flex items-center justify-between gap-3 border-t border-surface-800 bg-surface-900 px-3.5 py-2">
      <p className="min-w-0 truncate text-[10px] text-surface-500 tabular-nums" title={detail}>
        {detail || (withIva ? "Total" : "Total s/imp.")}
      </p>
      <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-white">
        {fmt(summary.totalUsd)}
      </span>
    </div>
  );
}

/**
 * Preview del carrito desde la búsqueda: lista real de productos cargados,
 * agrupados por distribuidor, sin ser el acceso principal al carrito.
 */
export default function CartFloat() {
  const pathname = usePathname();
  const { items, totalCount, hydrated } = useCart();
  const display = useProviderDisplay();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | string>("all");

  const onSearch = pathname?.startsWith("/search") ?? false;
  const hide =
    !hydrated ||
    !onSearch ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register");

  useEffect(() => {
    setOpen(false);
    setFilter("all");
  }, [pathname]);

  const groups = useMemo<ProviderGroup[]>(() => {
    const map = new Map<string, CartItem[]>();
    for (const item of items) {
      const list = map.get(item.provider) ?? [];
      list.push(item);
      map.set(item.provider, list);
    }
    return [...map.entries()]
      .map(([provider, providerItems]) => ({
        provider,
        label: PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " "),
        items: providerItems.sort((a, b) => cartItemKey(a).localeCompare(cartItemKey(b))),
        qty: providerItems.reduce((s, i) => s + i.qty, 0),
      }))
      .sort((a, b) => b.qty - a.qty);
  }, [items]);

  const visibleGroups = useMemo(
    () => (filter === "all" ? groups : groups.filter((g) => g.provider === filter)),
    [filter, groups]
  );

  const visibleItems = useMemo(
    () => visibleGroups.flatMap((g) => g.items),
    [visibleGroups]
  );

  const lineCount = items.length;

  if (hide) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-[min(100vw-2rem,26rem)] overflow-hidden rounded-2xl border border-surface-700 bg-surface-950 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-2 border-b border-surface-800 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white">Carrito</p>
              <p className="text-[10px] text-surface-500 tabular-nums">
                {lineCount === 0
                  ? "Sin productos"
                  : `${lineCount} ${lineCount === 1 ? "línea" : "líneas"} · ${totalCount} u.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-surface-500 hover:bg-surface-800 hover:text-white"
              aria-label="Cerrar preview"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {groups.length > 1 && (
            <div className="flex gap-1 overflow-x-auto border-b border-surface-800 px-3 py-2 scrollbar-none">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  filter === "all"
                    ? "bg-brand-600 text-white"
                    : "bg-surface-800 text-surface-400 hover:bg-surface-700 hover:text-surface-200"
                }`}
              >
                Todos
              </button>
              {groups.map(({ provider, label, qty }) => {
                const logo = display.logoUrl(provider);
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setFilter(provider)}
                    className={`flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold transition-colors ${
                      filter === provider
                        ? "bg-brand-600 text-white"
                        : "bg-surface-800 text-surface-400 hover:bg-surface-700 hover:text-surface-200"
                    }`}
                  >
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="" className="h-3.5 w-3.5 rounded-full object-contain bg-white" />
                    ) : null}
                    <span className="max-w-[5.5rem] truncate">{label}</span>
                    <span className="tabular-nums opacity-80">{qty}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="max-h-[min(50vh,20rem)] overflow-y-auto px-3.5">
            {visibleGroups.length === 0 ? (
              <p className="py-8 text-center text-xs text-surface-500">
                Agregá productos desde la búsqueda para verlos acá.
              </p>
            ) : (
              visibleGroups.map((group, idx) => (
                <div
                  key={group.provider}
                  className={idx > 0 ? "mt-1 border-t border-surface-800 pt-2" : "pt-1"}
                >
                  {filter === "all" && (
                    <div className="flex items-center gap-2 py-1.5">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-surface-700">
                        {display.logoUrl(group.provider) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={display.logoUrl(group.provider)!}
                            alt=""
                            className="h-full w-full object-contain p-0.5"
                          />
                        ) : (
                          <span className="text-[8px] font-bold text-slate-700">
                            {group.label.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-[11px] font-semibold text-surface-200">
                        {group.label}
                      </span>
                      <span className="ml-auto text-[10px] tabular-nums text-surface-500">
                        {group.qty} u.
                      </span>
                    </div>
                  )}
                  <div className="divide-y divide-surface-800/80">
                    {group.items.map((item) => (
                      <PreviewLine key={cartItemKey(item)} item={item} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {lineCount > 0 && (
            <>
              <PreviewTotals items={visibleItems} />
              <div className="border-t border-surface-800 px-3.5 py-2">
                <Link
                  href="/cart"
                  onClick={() => setOpen(false)}
                  className="block text-center text-[10px] font-medium text-surface-500 hover:text-brand-300 transition-colors"
                >
                  Abrir cotización completa →
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center gap-2 rounded-full shadow-xl pl-3.5 pr-4 py-3 transition-colors ${
          totalCount > 0
            ? "bg-brand-600 hover:bg-brand-500 text-white"
            : "bg-surface-900 hover:bg-surface-800 text-surface-300 border border-surface-700"
        }`}
        aria-label="Ver preview del carrito"
        aria-expanded={open}
      >
        <ShoppingCart className="w-4 h-4" />
        <span className="text-sm font-semibold tabular-nums">{totalCount}</span>
        <ChevronUp className={`w-3.5 h-3.5 transition-transform ${open ? "" : "rotate-180"}`} />
        {totalCount > 0 && groups.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-surface-950">
            {groups.length}
          </span>
        )}
      </button>
    </div>
  );
}
