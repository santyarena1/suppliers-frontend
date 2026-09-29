"use client";

import Link from "next/link";
import { Package, Search } from "lucide-react";
import { assetUrl } from "@/lib/assets";
import { formatARS, formatUSD } from "@/lib/format";
import type { BrandAvailabilityDistributor, BrandAvailabilityItem, BrandSemaphoreStatus } from "@/lib/api";
import { STOCK_STATUS_CHIP, STOCK_STATUS_DOT, STOCK_STATUS_LABEL, bestStatus } from "@/lib/brand-stock";

const LEGEND: BrandSemaphoreStatus[] = ["HIGH", "MEDIUM", "LOW", "NONE", "INCOMING", "UNKNOWN"];

export function StockLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-surface-400">
      {LEGEND.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${STOCK_STATUS_DOT[s]}`} />
          {STOCK_STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

export function StockChip({ d, showStock = false }: { d: BrandAvailabilityDistributor; showStock?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STOCK_STATUS_CHIP[d.status]} ${
        d.yours ? "ring-1 ring-brand-500/60" : ""
      }`}
      title={d.yours ? "Es uno de tus distribuidores" : undefined}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${STOCK_STATUS_DOT[d.status]}`} />
      <span className="text-white/90">{d.label}</span>
      <span className="opacity-80">
        {STOCK_STATUS_LABEL[d.status]}
        {showStock && d.stock != null ? ` · ${d.stock} u.` : ""}
      </span>
    </span>
  );
}

export function formatReferencePrice(price: number | null, currency: string) {
  if (price == null) return null;
  return currency === "ARS" ? formatARS(price) : formatUSD(price);
}

/**
 * Grilla de disponibilidad de los productos de la marca por distribuidor.
 * `audience` cambia lo que se ofrece: el comercio ve primero a sus distribuidores
 * y puede ir a buscar para comprar; el público solo ve rangos.
 */
export function BrandAvailabilityGrid({
  items,
  audience,
  limit,
}: {
  items: BrandAvailabilityItem[];
  audience: "client" | "public";
  limit?: number;
}) {
  const list = limit ? items.slice(0, limit) : items;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {list.map((item) => (
        <AvailabilityCard key={item.id} item={item} audience={audience} />
      ))}
    </div>
  );
}

function AvailabilityCard({ item, audience }: { item: BrandAvailabilityItem; audience: "client" | "public" }) {
  const status = bestStatus(item);
  const price = formatReferencePrice(item.referencePrice, item.currency);
  const yours = item.distributors.filter((d) => d.yours);
  const others = item.distributors.filter((d) => !d.yours);
  const searchQ = item.partNumber || item.name;
  return (
    <article className="group relative flex gap-3 rounded-2xl border border-surface-800 bg-surface-900/70 p-3 hover:border-surface-700 transition-colors">
      <span className={`absolute left-0 top-4 bottom-4 w-0.5 rounded-full ${STOCK_STATUS_DOT[status]}`} aria-hidden />
      <div className="w-20 h-20 flex-shrink-0 rounded-xl bg-black/40 overflow-hidden">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(item.imageUrl)} alt="" className="w-full h-full object-contain p-1.5" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-6 h-6 text-white/25" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-white line-clamp-2">{item.name}</p>
          {price && (
            <span className="flex-shrink-0 text-right">
              <span className="block text-[10px] uppercase tracking-wide text-surface-500">Precio ref.</span>
              <span className="text-sm font-semibold text-white tabular-nums">{price}</span>
            </span>
          )}
        </div>
        {item.partNumber && <p className="text-[11px] text-surface-500 mt-0.5 font-mono">{item.partNumber}</p>}
        {item.state === "INCOMING" && item.incomingAt && (
          <p className="text-[11px] text-sky-300 mt-1">
            Ingresa el {new Date(item.incomingAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.state ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${STOCK_STATUS_CHIP[item.state]}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STOCK_STATUS_DOT[item.state]}`} />
              {STOCK_STATUS_LABEL[item.state]}
            </span>
          ) : item.distributors.length === 0 ? (
            <span className="text-[11px] text-surface-500">Todavía sin distribuidores asociados</span>
          ) : (
            [...yours, ...others].map((d, i) => <StockChip key={`${d.provider}-${i}`} d={d} />)
          )}
        </div>
        {audience === "client" && item.state !== "DISCONTINUED" && (
          <Link
            href={`/search?q=${encodeURIComponent(searchQ)}`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            <Search className="w-3 h-3" />
            {yours.length > 0 ? "Buscar y comprar" : "Buscar en el catálogo"}
          </Link>
        )}
      </div>
    </article>
  );
}
