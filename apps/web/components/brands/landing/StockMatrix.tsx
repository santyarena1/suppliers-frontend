"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Package, Search } from "lucide-react";
import { assetUrl } from "@/lib/assets";
import type { BrandAvailabilityItem, BrandSemaphoreStatus } from "@/lib/api";
import { STOCK_STATUS_DOT, STOCK_STATUS_LABEL } from "@/lib/brand-stock";
import { formatReferencePrice } from "@/components/brands/BrandAvailability";
import { SURFACE } from "./Section";

const PAGE = 12;
const LEGEND: BrandSemaphoreStatus[] = ["HIGH", "MEDIUM", "LOW", "NONE", "UNKNOWN"];
const CELL_TEXT: Record<BrandSemaphoreStatus, string> = {
  HIGH: "text-emerald-200",
  MEDIUM: "text-lime-100",
  LOW: "text-amber-100",
  NONE: "text-red-200",
  INCOMING: "text-sky-200",
  DISCONTINUED: "text-surface-400",
  UNKNOWN: "text-surface-500",
};

interface Column {
  provider: string;
  label: string;
  yours: boolean;
}

/** Distribuidores como columnas: primero los del comercio, después los que tienen más productos. */
function columnsOf(items: BrandAvailabilityItem[]): Column[] {
  const map = new Map<string, Column & { count: number }>();
  for (const item of items) {
    for (const d of item.distributors) {
      const col = map.get(d.provider) ?? { provider: d.provider, label: d.label, yours: false, count: 0 };
      col.count += 1;
      col.yours = col.yours || Boolean(d.yours);
      map.set(d.provider, col);
    }
  }
  return [...map.values()].sort((a, b) => Number(b.yours) - Number(a.yours) || b.count - a.count);
}

/**
 * Semáforo de stock como matriz: productos en filas, distribuidores en columnas.
 * Es la forma más directa de comparar dónde hay cada producto.
 */
export function StockMatrix({ items, audience }: { items: BrandAvailabilityItem[]; audience: "client" | "public" }) {
  const [showAll, setShowAll] = useState(false);
  const columns = useMemo(() => columnsOf(items), [items]);
  const rows = showAll ? items : items.slice(0, PAGE);
  const client = audience === "client";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-surface-400">
        {LEGEND.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STOCK_STATUS_DOT[s]}`} />
            {STOCK_STATUS_LABEL[s]}
          </span>
        ))}
        {client && columns.some((c) => c.yours) && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-brand-500" /> Tus distribuidores
          </span>
        )}
      </div>

      <div className={`${SURFACE} overflow-x-auto`}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-400">
              <th scope="col" className="sticky left-0 z-10 bg-surface-900 px-4 py-3 font-medium min-w-[16rem]">
                Producto
              </th>
              <th scope="col" className="px-3 py-3 font-medium text-right whitespace-nowrap">
                Precio ref.
              </th>
              {columns.map((c) => (
                <th key={c.provider} scope="col" className="px-3 py-3 font-medium whitespace-nowrap">
                  <span className={c.yours && client ? "text-white" : undefined}>
                    {c.yours && client && <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-brand-500 align-middle" />}
                    {c.label}
                  </span>
                </th>
              ))}
              {client && <th scope="col" className="px-3 py-3" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <MatrixRow key={item.id} item={item} columns={columns} client={client} />
            ))}
          </tbody>
        </table>
      </div>

      {items.length > PAGE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="self-start text-sm font-medium text-brand-400 hover:text-brand-300"
        >
          {showAll ? "Ver menos" : `Ver los ${items.length} productos`}
        </button>
      )}
    </div>
  );
}

function MatrixRow({ item, columns, client }: { item: BrandAvailabilityItem; columns: Column[]; client: boolean }) {
  const price = formatReferencePrice(item.referencePrice, item.currency);
  const byProvider = new Map(item.distributors.map((d) => [d.provider, d]));
  const cell = "border-t border-white/[0.06] px-3 py-3 align-middle";
  return (
    <tr className="group hover:bg-white/[0.02]">
      <th scope="row" className={`${cell} sticky left-0 z-10 bg-surface-900 px-4 text-left font-normal`}>
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-white">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetUrl(item.imageUrl)} alt={item.name} className="h-full w-full object-contain p-1" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-surface-800">
                <Package className="h-4 w-4 text-surface-500" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm text-white">{item.name}</p>
            {item.partNumber && <p className="mt-0.5 font-mono text-xs text-surface-500">{item.partNumber}</p>}
          </div>
        </div>
      </th>
      <td className={`${cell} text-right tabular-nums whitespace-nowrap ${price ? "text-white" : "text-surface-600"}`}>
        {price ?? "—"}
      </td>
      {item.state ? (
        <td className={cell} colSpan={columns.length}>
          <StateNote item={item} />
        </td>
      ) : (
        columns.map((c) => {
          const d = byProvider.get(c.provider);
          return (
            <td key={c.provider} className={`${cell} whitespace-nowrap`}>
              {d ? (
                <span className={`inline-flex items-center gap-1.5 text-xs ${CELL_TEXT[d.status]}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${STOCK_STATUS_DOT[d.status]}`} />
                  {STOCK_STATUS_LABEL[d.status]}
                </span>
              ) : (
                <span className="text-xs text-surface-700">—</span>
              )}
            </td>
          );
        })
      )}
      {client && (
        <td className={`${cell} text-right`}>
          {item.state !== "DISCONTINUED" && (
            <Link
              href={`/search?q=${encodeURIComponent(item.partNumber || item.name)}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-300 hover:bg-brand-500/10"
            >
              <Search className="h-3.5 w-3.5" /> Comprar
            </Link>
          )}
        </td>
      )}
    </tr>
  );
}

function StateNote({ item }: { item: BrandAvailabilityItem }) {
  if (item.state === "INCOMING") {
    const when = item.incomingAt
      ? new Date(item.incomingAt).toLocaleDateString("es-AR", { day: "numeric", month: "long" })
      : null;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-sky-200">
        <span className={`h-2.5 w-2.5 rounded-full ${STOCK_STATUS_DOT.INCOMING}`} />
        Próximo ingreso{when ? ` · llega el ${when}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-surface-400">
      <span className={`h-2.5 w-2.5 rounded-full ${STOCK_STATUS_DOT.DISCONTINUED}`} />
      Discontinuado
    </span>
  );
}
