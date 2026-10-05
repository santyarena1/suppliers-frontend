import Link from "next/link";
import { ArrowRight, Plug, ShieldCheck, Zap } from "lucide-react";
import { CATALOG_API_ADDON_PRICE_USD } from "@/lib/catalog-api";
import { Reveal } from "./Reveal";

const POINTS = [
  {
    icon: Zap,
    title: "Se actualiza todo el día",
    text: "Precio y stock salen de la última sincronización con cada distribuidor.",
  },
  {
    icon: ShieldCheck,
    title: "Sin caídas ni datos a medias",
    text: "Si un distribuidor se cae, tu tienda sigue con el último dato bueno y sabe qué tan fresco es.",
  },
  {
    icon: Plug,
    title: "Se integra con todo",
    text: "Tienda online, ERP, Google Merchant y Meta. Con webhooks, cambios incrementales y exportación.",
  },
];

const SAMPLE = `GET /v1/products?inStock=true

{
  "data": [{
    "id": "prd_Yt5Wc9KqA2mN7xV1pL3sD8",
    "name": "Placa de video RTX 5070 12GB",
    "brand": { "name": "ASUS" },
    "availability": { "inStock": true, "offers": 3 },
    "bestOffer": {
      "price": { "currency": "USD",
                 "sale": { "gross": 812.40 } },
      "freshness": { "syncedAt": "2026-10-05T14:32:10Z",
                     "stale": false }
    }
  }],
  "pagination": { "nextCursor": "…", "hasMore": true }
}`;

/** Bloque de la API de catálogo dentro de Planes: módulo extra, incluido en Custom. */
export function CatalogApiPitch() {
  return (
    <Reveal>
      <div className="relative mt-16 overflow-hidden rounded-[var(--r)] border border-[var(--line-2)] bg-[linear-gradient(135deg,#15173a_0%,var(--bg-2)_60%)] p-7 sm:p-10">
        <div className="nl-glow" style={{ width: 420, height: 300, top: -180, right: -120 }} aria-hidden />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="nl-kicker">Módulo extra · API de catálogo</p>
            <h3 className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-tight text-white sm:text-[2rem]">
              Tu catálogo de NODO, en tu tienda y tu sistema
            </h3>
            <p className="nl-body mt-4 max-w-[52ch]">
              Todos tus distribuidores en una sola API: ficha completa, fotos, precio con impuestos y tu margen, y stock. Con key y
              secret, configurable para cada sistema que conectes.
            </p>
            <ul className="mt-7 flex flex-col gap-4">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)]">
                    <Icon className="h-4 w-4 text-[var(--accent-2)]" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-[0.95rem] font-semibold text-white">{title}</span>
                    <span className="block text-sm text-[var(--fg-2)]">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <p className="text-white">
                <span className="text-2xl font-bold tabular-nums">+US$ {CATALOG_API_ADDON_PRICE_USD}</span>
                <span className="ml-1 text-sm text-[var(--fg-3)]">por mes en Base y Pro</span>
              </p>
              <span className="nl-chip nl-chip--accent">Incluida en Custom</span>
            </div>
            <Link href="/developers" className="nl-btn nl-btn--ghost mt-6">
              Ver la documentación <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="min-w-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[#080a16] shadow-[0_30px_80px_-40px_rgb(64_51_252/0.6)]">
            <div className="flex items-center gap-1.5 border-b border-[var(--line)] px-4 py-3" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-[#f06a6a]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f5b041]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#3ecf8e]/70" />
              <span className="nl-mono ml-3 text-xs text-[var(--fg-3)]">API de catálogo · v1</span>
            </div>
            <pre className="nl-mono overflow-x-auto p-5 text-[12.5px] leading-relaxed text-[#cfd7f5]">{SAMPLE}</pre>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
