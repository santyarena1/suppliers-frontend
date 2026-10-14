"use client";

import Link from "next/link";
import { Activity, ChevronRight } from "lucide-react";

/** Módulos del comercio. Hoy la API de catálogo, incluida en todos los planes. */
export default function ModulesCard() {
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
            <span className="text-sm tabular-nums text-surface-200">Incluida</span>
            <Link
              href="/integracion-api"
              className="inline-flex items-center gap-1 rounded-lg border border-surface-700 px-2.5 py-1.5 text-xs text-surface-200 hover:text-white hover:border-surface-500"
            >
              Configurar
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </li>
      </ul>
    </section>
  );
}
