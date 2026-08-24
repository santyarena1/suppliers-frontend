"use client";

import { use, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import PrefsPanel from "@/components/PrefsPanel";
import PriceTag from "@/components/PriceTag";
import AddToCartButton from "@/components/AddToCartButton";
import SalePricePanel from "@/components/SalePricePanel";
import { useResults } from "@/lib/results";
import { useCart } from "@/lib/cart";
import { usePrefs } from "@/lib/prefs";
import { ProductDTO, Provider, searchApi, catalogApi, PricePoint } from "@/lib/api";
import { proxyImg, formatARS, formatUSD } from "@/lib/format";
import { PROVIDER_CHIP_COLOR as PROVIDER_COLOR } from "@/lib/providerColors";
import { linePricing, taxLabel } from "@/lib/tax";
import {
  ArrowLeft, Package, ImageOff, ChevronLeft, ChevronRight,
  ZoomIn, X, Copy, ExternalLink, Sparkles, TrendingUp, DollarSign,
} from "lucide-react";
import PriceHistoryChart from "@/components/PriceHistoryChart";

export default function ProductPage({ params }: { params: Promise<{ provider: string; externalId: string }> }) {
  const { provider, externalId } = use(params);
  const router = useRouter();
  const { find, query } = useResults();
  const { items: cartItems } = useCart();
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
  const [saleOpen, setSaleOpen] = useState(false);

  useEffect(() => {
    const found = find(providerName, extId);
    if (found) {
      setProduct(found);
      setLoading(false);
      return;
    }
    // No está en el caché de la última búsqueda (link directo, refresh, etc.)
    // — se lo pide directo al backend en vez de mostrar "no encontrado".
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

  // Find similar products in last results (same provider)
  useEffect(() => {
    if (!query || !product) return;
    // Try to use cached results
    try {
      const raw = sessionStorage.getItem("tgs_last_results");
      if (raw) {
        const { r } = JSON.parse(raw);
        const sameProvider = (r as ProductDTO[]).filter(
          (p) => p.provider === providerName && p.externalId !== extId
        ).slice(0, 6);
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
  const displayUSD = pricing ? (withIva ? pricing.gross : pricing.net) : 0;
  const conv = useMemo(() => convert(displayUSD), [convert, displayUSD]);
  const subtotalConv = useMemo(() => convert(pricing?.net ?? 0), [convert, pricing?.net]);
  const taxConv = useMemo(() => convert(pricing?.tax ?? 0), [convert, pricing?.tax]);

  const cartItem = cartItems.find((i) => i.provider === providerName && i.externalId === extId);
  const color = PROVIDER_COLOR[providerName] || "text-surface-400 bg-surface-400/10 border-surface-400/30";

  function copyId() {
    navigator.clipboard.writeText(extId);
  }

  return (
    <>
          {/* Header */}
          <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-6 py-3 flex items-center justify-between">
            <button
              onClick={() => {
                if (query.trim()) {
                  router.push(`/search?q=${encodeURIComponent(query.trim())}`);
                } else {
                  router.back();
                }
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
                <p className="text-xs text-surface-500 mb-6">
                  Puede que el proveedor lo haya dado de baja o que el link esté mal.
                </p>
                <Link href="/search" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-all">
                  <ArrowLeft className="w-4 h-4" />
                  Ir a búsqueda
                </Link>
              </div>
            )}

            {!loading && product && (
              <div className="max-w-6xl mx-auto px-6 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
                  {/* Left: image + info */}
                  <div className="flex flex-col gap-5">
                    {/* Image */}
                    <div className="relative bg-gradient-to-br from-surface-900 to-surface-950 border border-surface-800 rounded-2xl overflow-hidden aspect-square group">
                      {product.imageUrl && !imgErr ? (
                        <>
                          <Image
                            src={proxyImg(product.imageUrl)}
                            alt={product.name}
                            fill
                            className="object-contain p-3"
                            unoptimized
                            onError={() => setImgErr(true)}
                            priority
                          />
                          <button
                            onClick={() => setZoom(true)}
                            className="absolute top-4 right-4 bg-surface-900/80 backdrop-blur-sm hover:bg-surface-800 border border-surface-700 rounded-lg p-2 text-surface-300 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                          >
                            <ZoomIn className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-surface-700">
                          {imgErr ? <ImageOff className="w-16 h-16" /> : <Package className="w-16 h-16" />}
                          <span className="text-sm">Sin imagen disponible</span>
                        </div>
                      )}

                      <span className={`absolute top-4 left-4 text-xs font-bold px-2.5 py-1 rounded border ${color}`}>
                        {providerName.replace(/_/g, " ")}
                      </span>
                    </div>

                    {/* Info card */}
                    <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 flex flex-col gap-3">
                      <h2 className="text-sm font-semibold text-surface-300 mb-1">Información del producto</h2>
                      <DetailRow label="Proveedor">
                        <span className={`text-xs font-bold ${PROVIDER_COLOR[providerName]?.split(" ")[0]}`}>
                          {providerName.replace(/_/g, " ")}
                        </span>
                      </DetailRow>
                      <DetailRow label="ID externo">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-surface-200">{extId}</span>
                          <button onClick={copyId} className="text-surface-500 hover:text-white transition-colors" title="Copiar ID">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </DetailRow>
                      <DetailRow label="Precio base (USD)">
                        <span className="text-sm font-bold text-white tabular-nums">{formatUSD(pricing?.unitNet ?? 0)}</span>
                      </DetailRow>
                      <DetailRow label="Cotización aplicada">
                        {currentRate ? (
                          <div className="text-right">
                            <span className="text-xs text-surface-200 tabular-nums">${currentRate.venta.toLocaleString("es-AR")}</span>
                            <p className="text-[10px] text-surface-500">Dólar {dollarLabel(dollarType)}</p>
                          </div>
                        ) : <span className="text-xs text-surface-500">—</span>}
                      </DetailRow>
                      {product.imageUrl && (
                        <DetailRow label="Imagen origen">
                          <a href={product.imageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 truncate max-w-[200px]">
                            <ExternalLink className="w-3 h-3 flex-shrink-0" /> Ver original
                          </a>
                        </DetailRow>
                      )}
                    </div>

                    {/* Evolución de precio */}
                    <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5 flex flex-col gap-3">
                      <h2 className="text-sm font-semibold text-surface-300 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-brand-400" />
                        Evolución de precio
                      </h2>
                      {priceHistory.length >= 2 ? (
                        <PriceHistoryChart points={priceHistory} />
                      ) : (
                        <p className="text-xs text-surface-500">
                          Todavía no hay variación de precio registrada para este producto — se
                          va a ir armando el gráfico a medida que el precio cambie en las próximas
                          sincronizaciones.
                        </p>
                      )}
                    </div>

                    {/* Related */}
                    {related.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-brand-400" />
                          Productos relacionados
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {related.map((p, i) => (
                            <Link
                              key={`${p.provider}-${p.externalId}-${i}`}
                              href={`/product/${encodeURIComponent(p.provider)}/${encodeURIComponent(p.externalId)}`}
                              className="bg-surface-900 border border-surface-800 hover:border-surface-600 rounded-lg overflow-hidden transition-all group"
                            >
                              <div className="aspect-square relative bg-surface-950">
                                {p.imageUrl ? (
                                  <Image src={proxyImg(p.imageUrl)} alt={p.name} fill className="object-contain p-2 group-hover:scale-105 transition-transform" unoptimized />
                                ) : <Package className="w-6 h-6 text-surface-700 absolute inset-0 m-auto" />}
                              </div>
                              <div className="p-2.5">
                                <p className="text-[11px] text-surface-300 line-clamp-2 leading-tight mb-1.5">{p.name}</p>
                                <PriceTag product={p} size="sm" />
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: title + price + actions */}
                  <div className="flex flex-col gap-5">
                    <div>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border mb-3 ${color}`}>
                        {providerName.replace(/_/g, " ")}
                      </span>
                      <h1 className="text-xl font-bold text-white leading-snug text-balance">
                        {product.name}
                      </h1>
                      <p className="text-xs text-surface-500 font-mono mt-2">#{extId}</p>
                    </div>

                    {/* Price summary card */}
                    <div className="bg-surface-900 border border-surface-800 rounded-2xl p-5">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-3xl font-bold text-white tabular-nums">
                          {currency === "USD" ? formatUSD(conv.amount) : formatARS(conv.amount)}
                        </span>
                        {!withIva && <span className="text-xs text-surface-500 font-medium">sin imp.</span>}
                      </div>
                      {currency === "ARS" && currentRate && (
                        <p className="text-sm text-surface-400 tabular-nums mb-4">
                          {formatUSD(displayUSD)} <span className="text-surface-600">·</span> Dólar {dollarLabel(dollarType)} ${currentRate.venta.toLocaleString("es-AR")}
                        </p>
                      )}

                      {/* Breakdown */}
                      <div className="border-t border-surface-800 pt-3 flex flex-col gap-1.5 text-xs mb-4">
                        <div className="flex justify-between">
                          <span className="text-surface-400">Precio unitario</span>
                          <span className="text-surface-200 tabular-nums">
                            {currency === "USD" ? formatUSD(pricing?.unitNet ?? 0) : formatARS(convert(pricing?.unitNet ?? 0).amount)}
                          </span>
                        </div>
                        {qty > 1 && (
                          <div className="flex justify-between">
                            <span className="text-surface-400">Subtotal ({qty} u.)</span>
                            <span className="text-surface-200 tabular-nums">
                              {currency === "USD" ? formatUSD(pricing?.net ?? 0) : formatARS(subtotalConv.amount)}
                            </span>
                          </div>
                        )}
                        {withIva && pricing && pricing.tax > 0 && (
                          <div className="flex justify-between">
                            <span className="text-surface-400">{taxLabel(product ?? {})}</span>
                            <span className="text-surface-200 tabular-nums">
                              + {currency === "USD" ? formatUSD(pricing.tax) : formatARS(taxConv.amount)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Qty selector */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-surface-400">Cantidad</span>
                        <div className="flex items-center gap-1 bg-surface-800 border border-surface-700 rounded-lg p-0.5">
                          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-7 h-7 flex items-center justify-center text-surface-400 hover:text-white"><ChevronLeft className="w-3.5 h-3.5" /></button>
                          <input
                            type="number"
                            value={qty}
                            min={1}
                            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-14 bg-transparent text-white text-sm font-semibold text-center focus:outline-none tabular-nums"
                          />
                          <button onClick={() => setQty((q) => q + 1)} className="w-7 h-7 flex items-center justify-center text-surface-400 hover:text-white"><ChevronRight className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>

                      <AddToCartButtonWithQty product={product} qty={qty} />

                      <button
                        type="button"
                        onClick={() => setSaleOpen(true)}
                        className="mt-3 w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-lg py-2.5 border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 transition-all"
                      >
                        <DollarSign className="w-4 h-4" />
                        Ver precios de venta (referencia)
                      </button>
                      <p className="text-[10px] text-surface-500 mt-1.5 text-center leading-relaxed">
                        Referencia de mercado en locales. Sirve para estimar margen; no es tu precio de compra.
                      </p>

                      {cartItem && (
                        <p className="text-[11px] text-emerald-400 mt-2 text-center">
                          Ya tenés {cartItem.qty} unidad{cartItem.qty !== 1 ? "es" : ""} en el carrito
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={searchSameName}
                        className="flex-1 flex items-center justify-center gap-2 text-xs font-medium border border-surface-700 hover:border-surface-500 text-surface-300 hover:text-white rounded-lg py-2.5 transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Buscar similares en otros proveedores
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

      <SalePricePanel
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        seedQuery={product?.name ?? ""}
        costUsd={pricing?.unitNet ?? pricing?.net ?? null}
      />

      {/* Zoom modal */}
      {zoom && product?.imageUrl && (
        <div
          onClick={() => setZoom(false)}
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-8 cursor-zoom-out"
        >
          <button className="absolute top-5 right-5 text-white p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div className="relative w-full h-full max-w-4xl max-h-[90vh]">
            <Image src={proxyImg(product.imageUrl)} alt={product.name} fill className="object-contain" unoptimized />
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-surface-800 last:border-0">
      <span className="text-xs text-surface-500">{label}</span>
      {children}
    </div>
  );
}

function AddToCartButtonWithQty({ product, qty }: { product: ProductDTO; qty: number }) {
  const { add } = useCart();
  return (
    <button
      onClick={() => add(product, qty)}
      className="w-full bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg py-3 transition-all"
    >
      Agregar al carrito ({qty})
    </button>
  );
}
