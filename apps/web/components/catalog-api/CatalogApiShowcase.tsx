"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Boxes,
  FileSpreadsheet,
  Globe,
  Image as ImageIcon,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  Workflow,
  Zap,
} from "lucide-react";
import { CATALOG_API_ADDON_PRICE_USD } from "@/lib/catalog-api";

const USES = [
  { icon: ShoppingBag, title: "Tu tienda online", body: "Tiendanube, WooCommerce, Shopify o tu web propia: productos, fotos, precio de venta y stock siempre al día." },
  { icon: Workflow, title: "Tu ERP o sistema de gestión", body: "Altas, bajas y cambios de precio y stock sin cargar nada a mano. Sincronizás solo lo que cambió." },
  { icon: Globe, title: "Google Shopping y Meta", body: "Feeds listos para Google Merchant y el catálogo de Instagram y Facebook, con un link." },
  { icon: FileSpreadsheet, title: "Listas y planillas", body: "Exportás todo el catálogo en Excel, CSV o JSON con tu margen y en la moneda que quieras." },
  { icon: Bell, title: "Avisos automáticos", body: "Webhooks: NODO le avisa a tu sistema cuando cambia un precio, el stock o entra un producto." },
  { icon: Zap, title: "Lo que se te ocurra", body: "Comparadores, cotizadores, bots de WhatsApp o apps propias: es una API estándar y documentada." },
];

const DATA = [
  {
    icon: Tag,
    title: "Identificación",
    items: ["Nombre, marca y categoría unificadas", "EAN, part number y SKU", "Mismo producto de varios distribuidores, agrupado"],
  },
  {
    icon: ImageIcon,
    title: "Contenido",
    items: ["Galería completa de fotos", "Descripción corta y larga", "Garantía, peso, medidas y tags"],
  },
  {
    icon: Layers,
    title: "Precio",
    items: ["Costo neto e impuestos desglosados", "Precio de venta con tu margen", "USD o pesos, con el dólar que elijas"],
  },
  {
    icon: Boxes,
    title: "Stock y frescura",
    items: ["Stock de cada distribuidor", "Cuándo se actualizó cada dato", "Historial de precios"],
  },
];

const SAMPLE = `{
  "id": "prd_2Lk9QwE5rTyU8iOp3aSd7f",
  "name": "Monitor ASUS TUF VG249Q1A 23,8\\" 165Hz",
  "brand": { "name": "ASUS" },
  "category": { "path": ["Monitores"] },
  "ean": "4711081976386",
  "images": [{ "url": "https://…/1.jpg" }, { "url": "https://…/2.jpg" }],
  "availability": { "inStock": true, "totalStock": 34, "offers": 3 },
  "bestOffer": {
    "provider": { "name": "Proveedor 2" },
    "price": {
      "currency": "ARS",
      "cost": { "net": 189500, "gross": 229295 },
      "sale": { "gross": 279740, "markupPercent": 22 }
    },
    "freshness": { "syncedAt": "2026-10-06T14:02:11Z", "stale": false }
  }
}`;

/**
 * Presentación del módulo: qué se puede hacer, qué datos manda NODO de cada
 * producto y cuánto cuesta. Es lo primero que ve un comercio que todavía no lo
 * activó (el acceso está en el menú para todos).
 */
export default function CatalogApiShowcase({
  included,
  canManage,
  docsUrl,
  activation,
}: {
  /** Custom: viene incluido. */
  included: boolean;
  canManage: boolean;
  docsUrl: string;
  /** Tarjeta de activación (la de siempre), que va en el lugar del precio. */
  activation: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-2xl border border-brand-500/25 bg-[radial-gradient(120%_120%_at_0%_0%,rgba(106,108,246,0.22),transparent_55%)] px-5 py-7 sm:px-8 sm:py-9">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/30 bg-brand-500/10 px-2.5 py-0.5 text-[11px] font-medium text-brand-200">
          <Zap className="w-3 h-3" /> Integración API
        </span>
        <h2 className="mt-3 max-w-2xl text-2xl sm:text-3xl font-semibold tracking-tight text-white">
          Tu catálogo de NODO, conectado a todos tus sistemas
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-surface-300">
          Todos los productos de tus distribuidores, con fotos, precio y stock, en tu tienda online, tu ERP, Google o
          Meta. Se actualiza solo y muy seguido, y si un distribuidor se cae, tu integración sigue respondiendo con el
          último dato bueno: nada de precios a medias ni caídas.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href={docsUrl} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-surface-600 px-3.5 py-2 text-sm text-surface-100 hover:border-surface-400 hover:text-white">
            Ver la documentación <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <span className="text-xs text-surface-400">
            {included
              ? "Incluido en tu plan Custom."
              : `US$ ${CATALOG_API_ADDON_PRICE_USD} por mes, se suma a tu mensualidad. Incluido en Custom.`}
          </span>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-white">Qué podés hacer</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-surface-800 bg-surface-900/60 p-4 transition-colors hover:border-surface-700">
              <Icon className="w-5 h-5 text-brand-300" />
              <p className="mt-2.5 text-sm font-medium text-white">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-surface-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <h3 className="text-sm font-semibold text-white">Qué te manda NODO de cada producto</h3>
          <p className="mt-1 text-xs text-surface-400">Todo lo que tenemos, en un solo formato para todos tus distribuidores.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {DATA.map(({ icon: Icon, title, items }) => (
              <div key={title} className="rounded-xl border border-surface-800 bg-surface-900/60 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <Icon className="w-4 h-4 text-emerald-400" /> {title}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-surface-300">
                  {items.map((item) => (
                    <li key={item} className="flex gap-1.5">
                      <span className="text-surface-600">·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Así llega un producto</h3>
          <p className="mt-1 text-xs text-surface-400">Ejemplo de respuesta (resumido). Vos elegís qué campos y en qué moneda.</p>
          <pre className="mt-3 max-h-[22rem] overflow-auto rounded-xl border border-surface-800 bg-surface-950 p-4 text-[11px] leading-relaxed text-surface-300">
            <code>{SAMPLE}</code>
          </pre>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: RefreshCw, title: "Siempre al día", body: "Se sincroniza muy seguido con cada distribuidor y te dice qué tan fresco es cada dato." },
          { icon: ShieldCheck, title: "Sin caídas", body: "Si un portal falla, NODO sigue respondiendo con lo último bueno. Tu tienda no se entera." },
          { icon: Lock, title: "Seguro", body: "API key y secret, IPs permitidas, permisos por key y revocación al instante. Tus distribuidores pueden quedar ocultos." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3 rounded-xl border border-surface-800 p-4">
            <Icon className="w-5 h-5 flex-shrink-0 text-brand-300" />
            <div>
              <p className="text-sm font-medium text-white">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-surface-400">{body}</p>
            </div>
          </div>
        ))}
      </section>

      <section id="activar" className="scroll-mt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Store className="w-4 h-4 text-brand-300" /> {included ? "Tu plan lo incluye" : "Cuánto cuesta"}
        </h3>
        {!included && (
          <p className="mt-1 text-xs text-surface-400">
            Es un módulo aparte: US$ {CATALOG_API_ADDON_PRICE_USD} por mes que se suma a tu mensualidad de NODO, en el
            mismo pago. Lo activás y lo desactivás cuando quieras.
            {!canManage && " Lo activa el dueño o un administrador del comercio."}
          </p>
        )}
        <div className="mt-3">{activation}</div>
      </section>
    </div>
  );
}
