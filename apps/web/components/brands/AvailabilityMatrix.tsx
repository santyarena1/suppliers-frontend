"use client";

import { useMemo } from "react";
import StockStatusBadge from "@/components/brands/StockStatusBadge";
import type { BrandProduct, BrandDistributor, ProductAvailability, StockStatus } from "@/lib/brands";
import { STOCK_STATUSES } from "@/lib/brands/constants";
import { Loader2 } from "lucide-react";

interface Props {
  products: BrandProduct[];
  distributors: BrandDistributor[];
  matrix: ProductAvailability[];
  loading?: boolean;
  editable?: boolean;
  onCellChange?: (productId: string, distributorId: string, status: StockStatus) => void;
}

function cellKey(productId: string, distributorId: string) {
  return `${productId}:${distributorId}`;
}

export default function AvailabilityMatrix({
  products,
  distributors,
  matrix,
  loading,
  editable,
  onCellChange,
}: Props) {
  const cellMap = useMemo(() => {
    const m = new Map<string, ProductAvailability>();
    matrix.forEach((a) => m.set(cellKey(a.productId, a.distributorId), a));
    return m;
  }, [matrix]);

  const activeDistributors = distributors.filter((d) => d.active && d.visibleToUsers !== false);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16 text-surface-500 text-sm">
        No hay productos para mostrar en el mapa de disponibilidad.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-surface-800/80">
            <th className="sticky left-0 z-10 bg-surface-800 px-4 py-3 text-left font-medium text-surface-300 min-w-[220px] border-r border-surface-700">
              Producto
            </th>
            {activeDistributors.map((d) => (
              <th key={d.id} className="px-3 py-3 text-center font-medium text-surface-300 min-w-[130px]">
                {d.distributor.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-t border-surface-800 hover:bg-surface-800/30">
              <td className="sticky left-0 z-10 bg-surface-900 px-4 py-2.5 border-r border-surface-800">
                <p className="font-medium text-surface-100 truncate max-w-[200px]" title={p.commercialName}>
                  {p.commercialName}
                </p>
                <p className="text-[10px] text-surface-500 mt-0.5">{p.brandSku}</p>
              </td>
              {activeDistributors.map((d) => {
                const avail = cellMap.get(cellKey(p.id, d.distributorId));
                return (
                  <td key={d.id} className="px-2 py-2 text-center align-middle">
                    {editable ? (
                      <select
                        value={avail?.status ?? ""}
                        onChange={(e) =>
                          onCellChange?.(p.id, d.distributorId, e.target.value as StockStatus)
                        }
                        className="w-full bg-surface-800 border border-surface-700 rounded px-1 py-1 text-[10px] text-surface-200 focus:border-brand-500 focus:outline-none"
                      >
                        <option value="">—</option>
                        {STOCK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : avail ? (
                      <div className="flex flex-col items-center gap-1">
                        <StockStatusBadge status={avail.status} />
                        {avail.estimatedArrivalDate && (
                          <span className="text-[9px] text-surface-500">
                            {new Date(avail.estimatedArrivalDate).toLocaleDateString("es-AR")}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-surface-600">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
