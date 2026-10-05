"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ChevronRight } from "lucide-react";
import { catalogApiAdmin } from "@/lib/api";
import { CATALOG_API_ADDON_PRICE_USD, type CatalogApiAddonState } from "@/lib/catalog-api";
import { formatUsd, type MySubscription } from "@/lib/plans";

/** El backend puede devolver el total con módulos; si no, se suma acá. */
type WithTotals = MySubscription & { monthlyTotal?: number | null };

/**
 * Módulos extra del comercio (hoy: API de catálogo) y el total mensual
 * = plan + módulos activos. En Custom la API viene incluida.
 */
export default function ModulesCard({ sub }: { sub: MySubscription }) {
  const [addon, setAddon] = useState<CatalogApiAddonState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    catalogApiAdmin
      .overview()
      .then((res) => alive && setAddon(res.data.addon))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const included = sub.plan === "CUSTOM" || !!addon?.includedInPlan;
  const enabled = !!addon?.enabled && !included;
  const price = addon?.priceUsd ?? CATALOG_API_ADDON_PRICE_USD;
  const fromApi = (sub as WithTotals).monthlyTotal;
  const total = typeof fromApi === "number" ? fromApi : sub.price + (enabled ? price : 0);

  if (failed && !included) return null;

  return (
    <section className="rounded-2xl border border-surface-800 p-5">
      <h2 className="text-sm font-semibold text-white">Módulos</h2>
      <ul className="mt-3 divide-y divide-surface-800">
        <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <Activity className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-400" />
            <div className="min-w-0">
              <p className="text-sm text-white">API de catálogo</p>
              <p className="text-xs text-surface-500">Tu catálogo en tu tienda, ERP, Google y Meta, con keys y webhooks.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums text-surface-200">
              {included ? "Incluida" : enabled ? `+${formatUsd(price)}/mes` : addon ? "No activa" : "…"}
            </span>
            <Link
              href="/configuracion/api"
              className="inline-flex items-center gap-1 rounded-lg border border-surface-700 px-2.5 py-1.5 text-xs text-surface-200 hover:text-white hover:border-surface-500"
            >
              {included || enabled ? "Configurar" : `Activar · ${formatUsd(price)}/mes`}
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </li>
      </ul>
      {enabled && (
        <div className="mt-1 flex items-center justify-between border-t border-surface-800 pt-3 text-sm">
          <span className="text-surface-400">Total por mes (plan + módulos)</span>
          <span className="font-semibold tabular-nums text-white">{formatUsd(total)}</span>
        </div>
      )}
    </section>
  );
}
