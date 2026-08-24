"use client";

import { use, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import PrefsPanel from "@/components/PrefsPanel";
import PriceTag from "@/components/PriceTag";
import SalePricePanel from "@/components/SalePricePanel";
import { useResults } from "@/lib/results";
import { useCart } from "@/lib/cart";
import { usePrefs } from "@/lib/prefs";
import { ProductDTO, Provider, searchApi, catalogApi, PricePoint } from "@/lib/api";
import { proxyImg, formatARS, formatUSD } from "@/lib/format";
import { PROVIDER_CHIP_COLOR as PROVIDER_COLOR } from "@/lib/providerColors";
import {
  linePricing,
  taxLabel,
  extractTaxLines,
  formatAlicuota,
} from "@/lib/tax";
import {
  ArrowLeft,
  Package,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  X,
  Copy,
  ExternalLink,
  Sparkles,
  TrendingUp,
  Check,
} from "lucide-react";
import PriceHistoryChart from "@/components/PriceHistoryChart";

export default function ProductPage({ params }: { params: Promise<{ provider: string; externalId: string }> }) {
  const { provider, externalId } = use(params);
  const router = useRouter();
  const { find, query } = useResults();
  const { items: cartItems, add } = useCart();
  const { currency, withIva, convert, currentRate, dollarLabel, dollarType } = usePrefs();

  const dec = (s: string) => decodeURIComponent(s);
  const providerName = dec(provider);
  const extId = dec(externalId);

  const [product, setProduct] = useState<ProductDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<ProductDTO[]>([]);
  const [imgErr, setImgErr] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [qty, setQty] = useState(1);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [copied, setCopied] = useState(false);
  const [addedFlash, setAddedFlash] = useState(false);

  useEffect(() => {
    setImgErr(false);
    const found = find(providerName, extId);
    if (found) {
      setProduct(found);
      setLoading(false);
      return;
    }
    catalogApi
      .getProduct(providerName as Provider, extId)
      .then((res) => setProduct(res.data))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [providerName, extId, find]);

  useEffect(() => {
    if (!product) return;
    catalogApi
      .priceHistory(providerName as Provider, extId)
      .then((res) => setPriceHistory(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPriceHistory([]));
  }, [product, providerName, extId]);

  useEffect(() => {
    if (!query || !product) return;
    try {
      const raw = sessionStorage.getItem("tgs_last_results");
      if (raw) {
        const { r } = JSON.parse(raw);
        const sameProvider = (r as ProductDTO[])
          .filter((p) => p.provider === providerName && p.externalId !== extId)
          .slice(0, 6);
        setRelated(sameProvider);
      }
    } catch { /**/ }
  }, [query, product, providerName, extId]);

  async function searchSameName() {
    if (!product) return;
    try {
      const res = await searchApi.all(product.name.split(" ").slice(0, 3).join(" "));
      const others = res.data.filter((p) => p.externalId !== extId).slice(0, 8);
      setRelated(others);
    } catch { /**/ }
  }

  const pricing = product ? linePricing(product, qty) : null;
  const taxLines = product ? extractTaxLines(product) : [];
  const displayUSD = pricing ? (withIva ? pricing.gross : pricing.net) : 0;
  const unitDisplayUsd = pricing ? (withIva ? pricing.unitGross : pricing.unitNet) : 0;
  const conv = useMemo(() => convert(displayUSD), [convert, displayUSD]);
  const unitConv = useMemo(() => convert(unitDisplayUsd), [convert, unitDisplayUsd]);
  const unitNetConv = useMemo(() => convert(pricing?.unitNet ?? 0), [convert, pricing?.unitNet]);

  const cartItem = cartItems.find((i) => i.provider === providerName && i.externalId === extId);
  const color = PROVIDER_COLOR[providerName] || "text-surface-400 bg-surface-400/10 border-surface-400/30";

  function copyId() {
    void navigator.clipboard.writeText(extId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function addToCart() {
    if (!product) return;
    add(product, qty);
    setAddedFlash(true);
    setTimeout(() => setAddedFlash(false), 1600);
  }

  function money(usd: number) {
    if (currency === "USD") return formatUSD(usd);
    return formatARS(convert(usd).amount);
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950/95 backdrop-blur-sm px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <button
          type="button"
          onClick={() => {
            if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
            else router.back();
          }}
          className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver a búsqueda
        </button>
        <PrefsPanel />
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 rounded-full border-2 border-surface-700 border-t-brand-500 animate-spin" />
          </div>
        )}

        {!loading && !product && (
          <div className="px-6 py-16 max-w-2xl mx-auto text-center">
            <Package className="w-12 h-12 text-surface-700 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-white mb-2">Producto no encontrado</h2>
            <p className="text-sm text-surface-400 mb-1">
              No encontramos <span className="font-mono text-surface-200">{providerName} / {extId}</span> en nuestra base.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 mt-6 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Ir a búsqueda
            </Link>
          </div>
        )}

        {!loading && product && pricing && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
            {/* Hero: galería + compra */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] gap-6 lg:gap-8 items-start">
              <div className="relative bg-white rounded-2xl border border-surface-800 overflow-hidden aspect-square shadow-sm">
                {product.imageUrl && !imgErr ? (
                  <>
                    <Image
                      src={proxyImg(product.imageUrl, { trim: false })}
                      alt={product.name}
                      fill
                      className="object-contain p-6 sm:p-8"
                      unoptimized
                      onError={() => setImgErr(true)}
                      priority
                    />
                    <button
                      type="button"
                      onClick={() => setZoom(true)}
                      className="absolute top-3 right-3 bg-surface-950/80 hover:bg-surface-900 border border-surface-700 rounded-lg p-2 text-surface-300 hover:text-white transition-all"
                      aria-label="Ampliar imagen"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-950 text-surface-600">
                    {imgErr ? <ImageOff className="w-14 h-14" /> : <Package className="w-14 h-14" />}
                    <span className="text-sm">Sin imagen disponible</span>
                  </div>
                )}
                <span className={`absolute top-3 left-3 text-[10px] font-bold px-2 py-1 rounded-md border backdrop-blur-sm ${color}`}>
                  {providerName.replace(/_/g, " ")}
                </span>
              </div>

              <aside className="lg:sticky lg:top-16 flex flex-col gap-4">
                <div>
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border mb-2 ${color}`}>
                    {providerName.replace(/_/g, " ")}
                  </span>
                  <h1 className="text-xl sm:text-2xl font-bold text-white leading-snug text-balance tracking-tight">
                    {product.name}
                  </h1>
                  <div className="mt-2 flex items-center gap-2 text-xs text-surface-500">
                    <span className="font-mono">#{extId}</span>
                    <button
                      type="button"
                      onClick={copyId}
                      className="inline-flex items-center gap-1 text-surface-500 hover:text-white transition-colors"
                      title="Copiar ID"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>

                {/* Precio + desglose */}
                <div className="rounded-2xl border border-surface-800 bg-surface-900/80 overflow-hidden">
                  <div className="px-5 pt-5 pb-4 border-b border-surface-800">
                    <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">
                      {withIva ? "Precio con impuestos" : "Precio sin impuestos"}
                      {qty > 1 ? ` · ${qty} u.` : ""}
                    </p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-3xl sm:text-4xl font-bold text-white tabular-nums tracking-tight">
                        {currency === "USD" ? formatUSD(conv.amount) : formatARS(conv.amount)}
                      </span>
                    </div>
                    {currency === "ARS" ? (
                      <p className="text-sm text-surface-400 tabular-nums mt-1.5">
                        {formatUSD(displayUSD)}
                        {currentRate && (
                          <>
                            <span className="text-surface-600"> · </span>
                            Dólar {dollarLabel(dollarType)} ${currentRate.venta.toLocaleString("es-AR")}
                          </>
                        )}
                      </p>
                    ) : (
                      unitConv.amount > 0 && (
                        <p className="text-sm text-surface-400 tabular-nums mt-1.5">
                          ≈ {formatARS(unitConv.amount)}
                          {qty > 1 ? " c/u" : ""}
                        </p>
                      )
                    )}
                  </div>

                  <div className="px-5 py-4 space-y-2.5 text-xs">
                    <p className="text-[10px] uppercase tracking-wider text-surface-500 font-medium">
                      Desglose de costo
                    </p>

                    <BreakdownRow
                      label="Precio de lista (USD)"
                      value={formatUSD(pricing.unitNet)}
                      hint="Costo del proveedor"
                    />
                    {currentRate && (
                      <BreakdownRow
                        label={`Cotización · ${dollarLabel(dollarType)}`}
                        value={`$${currentRate.venta.toLocaleString("es-AR")}`}
                        hint="Tipo de cambio aplicado"
                      />
                    )}
                    <BreakdownRow
                      label="Costo en ARS (sin imp.)"
                      value={formatARS(unitNetConv.amount)}
                    />

                    {taxLines.filter((l) => l.unitAmount > 0.0001).map((line) => (
                      <BreakdownRow
                        key={`${line.kind}-${line.label}`}
                        label={`${line.label}${line.percent != null ? ` ${formatAlicuota(line.percent)}` : ""}`}
                        value={`+ ${money(line.unitAmount)}`}
                        muted
                      />
                    ))}
                    {taxLines.every((l) => l.unitAmount <= 0.0001) && pricing.tax > 0 && (
                      <BreakdownRow label={taxLabel(product)} value={`+ ${money(pricing.tax / qty)}`} muted />
                    )}

                    <div className="border-t border-surface-800 pt-2.5 mt-1">
                      <BreakdownRow
                        label="Costo unitario final"
                        value={money(pricing.unitGross)}
                        strong
                      />
                      {qty > 1 && (
                        <BreakdownRow
                          label={`Total × ${qty}`}
                          value={money(pricing.gross)}
                          strong
                        />
                      )}
                    </div>
                    <p className="text-[10px] text-surface-600 leading-relaxed pt-1">
                      El desglose usa tu cotización y preferencias de impuestos. El margen vs locales
                      se calcula sobre el costo sin impuestos.
                    </p>
                  </div>

                  <div className="px-5 pb-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-surface-400">Cantidad</span>
                      <div className="flex items-center gap-0.5 bg-surface-800 border border-surface-700 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          className="w-8 h-8 flex items-center justify-center text-surface-400 hover:text-white"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          value={qty}
                          min={1}
                          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-12 bg-transparent text-white text-sm font-semibold text-center focus:outline-none tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => setQty((q) => q + 1)}
                          className="w-8 h-8 flex items-center justify-center text-surface-400 hover:text-white"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={addToCart}
                      className="w-full bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl py-3 transition-all"
                    >
                      {addedFlash ? "Agregado al carrito" : `Agregar al carrito · ${qty}`}
                    </button>
                    {cartItem && (
                      <p className="text-[11px] text-emerald-400 text-center">
                        Ya tenés {cartItem.qty} en el carrito
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void searchSameName()}
                  className="flex items-center justify-center gap-2 text-xs font-medium border border-surface-700 hover:border-surface-500 text-surface-300 hover:text-white rounded-xl py-2.5 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Buscar similares en otros proveedores
                </button>
              </aside>
            </div>

            {/* Referencia de mercado */}
            <SalePricePanel
              variant="inline"
              seedQuery={product.name}
              costUsd={pricing.unitNet}
            />

            {/* Meta + evolución */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-5">
                <h2 className="text-sm font-semibold text-white mb-3">Datos del producto</h2>
                <dl className="space-y-0">
                  <MetaRow label="Proveedor">
                    <span className={`text-xs font-bold ${PROVIDER_COLOR[providerName]?.split(" ")[0]}`}>
                      {providerName.replace(/_/g, " ")}
                    </span>
                  </MetaRow>
                  <MetaRow label="SKU / ID">
                    <span className="text-xs font-mono text-surface-200">{extId}</span>
                  </MetaRow>
                  <MetaRow label="Impuestos detectados">
                    <span className="text-xs text-surface-300">{taxLabel(product)}</span>
                  </MetaRow>
                  {product.imageUrl && (
                    <MetaRow label="Imagen">
                      <a
                        href={product.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-400 hover:text-brand-300 inline-flex items-center gap-1"
                      >
                        Ver original <ExternalLink className="w-3 h-3" />
                      </a>
                    </MetaRow>
                  )}
                </dl>
              </section>

              <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-5">
                <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-400" />
                  Evolución de precio
                </h2>
                {priceHistory.length >= 2 ? (
                  <PriceHistoryChart points={priceHistory} />
                ) : (
                  <p className="text-xs text-surface-500 leading-relaxed">
                    Todavía no hay variación registrada. El gráfico se arma cuando el precio cambie
                    en próximas sincronizaciones.
                  </p>
                )}
              </section>
            </div>

            {related.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-400" />
                  Relacionados
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {related.map((p, i) => (
                    <RelatedCard key={`${p.provider}-${p.externalId}-${i}`} product={p} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {zoom && product?.imageUrl && (
        <div
          role="dialog"
          aria-modal
          onClick={() => setZoom(false)}
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6 cursor-zoom-out"
        >
          <button
            type="button"
            className="absolute top-5 right-5 text-white p-2 hover:bg-white/10 rounded-lg"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="relative w-full h-full max-w-4xl max-h-[90vh] bg-white rounded-xl overflow-hidden">
            <Image
              src={proxyImg(product.imageUrl, { trim: false })}
              alt={product.name}
              fill
              className="object-contain p-4"
              unoptimized
            />
          </div>
        </div>
      )}
    </>
  );
}

function BreakdownRow({
  label,
  value,
  hint,
  muted,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`leading-snug ${strong ? "text-surface-200 font-medium" : muted ? "text-surface-500" : "text-surface-400"}`}>
          {label}
        </p>
        {hint && <p className="text-[10px] text-surface-600 mt-0.5">{hint}</p>}
      </div>
      <span
        className={`tabular-nums flex-shrink-0 ${
          strong ? "text-white font-semibold text-sm" : muted ? "text-surface-400" : "text-surface-200"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-surface-800/80 last:border-0">
      <dt className="text-xs text-surface-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function RelatedCard({ product }: { product: ProductDTO }) {
  const [err, setErr] = useState(false);
  const href = `/product/${encodeURIComponent(product.provider)}/${encodeURIComponent(product.externalId)}`;
  return (
    <Link
      href={href}
      className="bg-surface-900 border border-surface-800 hover:border-surface-600 rounded-xl overflow-hidden transition-all group"
    >
      <div className="aspect-square relative bg-white">
        {product.imageUrl && !err ? (
          <Image
            src={proxyImg(product.imageUrl, { trim: false })}
            alt={product.name}
            fill
            className="object-contain p-2 group-hover:scale-105 transition-transform"
            unoptimized
            onError={() => setErr(true)}
          />
        ) : (
          <Package className="w-6 h-6 text-surface-400 absolute inset-0 m-auto" />
        )}
      </div>
      <div className="p-2.5 bg-surface-950">
        <p className="text-[11px] text-surface-300 line-clamp-2 leading-tight mb-1.5 min-h-[2.2rem]">
          {product.name}
        </p>
        <PriceTag product={product} size="sm" />
      </div>
    </Link>
  );
}
