"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import PrefsPanel from "@/components/PrefsPanel";
import PriceTag from "@/components/PriceTag";
import SalePricePanel from "@/components/SalePricePanel";
import { useResults } from "@/lib/results";
import { usePrefs } from "@/lib/prefs";
import { ProductDTO, Provider, searchApi, catalogApi, PricePoint } from "@/lib/api";
import { proxyImg, formatARS, formatUSD } from "@/lib/format";
import ProviderBadge, { providerLabel } from "@/components/ProviderBadge";
import {
  linePricing,
  taxLabel,
  extractTaxLines,
  formatAlicuota,
} from "@/lib/tax";
import { displayAmountFromPricing, displayTaxTitle } from "@/lib/display-price";
import { getIibbRatePercent, useIibbRatesEpoch } from "@/lib/iibb-rates";
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
  ChevronDown,
  Store,
} from "lucide-react";
import ProductBuyActions from "@/components/ProductBuyActions";
import PriceHistoryChart from "@/components/PriceHistoryChart";

export default function ProductPage({ params }: { params: Promise<{ provider: string; externalId: string }> }) {
  const { provider, externalId } = use(params);
  const router = useRouter();
  const { find, query } = useResults();
  const { currency, withIva, withIibb, convert, currentRate, dollarLabel, dollarType } = usePrefs();
  useIibbRatesEpoch();

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

  useEffect(() => {
    setImgErr(false);
    let cancelled = false;
    const found = find(providerName, extId);
    if (found) {
      setProduct(found);
      setLoading(false);
    } else {
      setLoading(true);
    }
    // Siempre pedimos la ficha completa: la búsqueda puede venir incompleta
    // o desactualizada respecto a marca/categoría/stock/etc.
    catalogApi
      .getProduct(providerName as Provider, extId)
      .then((res) => {
        if (!cancelled && res.data) setProduct(res.data);
      })
      .catch(() => {
        if (!cancelled && !found) setProduct(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
  const shown = pricing
    ? displayAmountFromPricing(
        pricing,
        { withIva, withIibb, provider: providerName },
        qty
      )
    : null;
  const displayUSD = shown?.displayUsd ?? 0;
  const unitDisplayUsd = shown?.unitDisplayUsd ?? 0;
  const conv = convert(displayUSD);
  const unitConv = convert(unitDisplayUsd);
  const unitNetConv = convert(pricing?.unitNet ?? 0);
  const estimatedIibbLine =
    shown?.estimatedIibb && shown.iibbUnitUsd > 0.0001
      ? {
          label: "IIBB (est.)",
          percent: shown.iibbPercent,
          unitAmount: shown.iibbUnitUsd,
        }
      : null;
  const visibleTaxLines = withIibb
    ? taxLines
    : taxLines.filter((l) => l.kind !== "iibb");
  const knownIibbPct = getIibbRatePercent(providerName);


  function copyId() {
    void navigator.clipboard.writeText(extId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
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
          <>
            {/* Todo el producto — sin locales */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <ProviderBadge provider={providerName} variant="inline" size="md" chip />
                  {product.brand && (
                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded border border-surface-700 bg-surface-900 text-surface-200">
                      {product.brand}
                    </span>
                  )}
                  {(product.category || product.subcategory) && (
                    <span className="text-xs text-surface-500">
                      {[product.category, product.subcategory].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  <span className="font-mono text-xs text-surface-500">#{extId}</span>
                  <button
                    type="button"
                    onClick={copyId}
                    className="inline-flex items-center gap-1 text-xs text-surface-500 hover:text-white transition-colors"
                    title="Copiar ID"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white leading-snug text-balance tracking-tight">
                  {product.name}
                </h1>
                {(product.stock != null || product.stockStatus) && (
                  <p className="mt-2 text-xs text-surface-400">
                    {product.stock != null && (
                      <span className={product.stock > 0 ? "text-emerald-400" : "text-amber-400"}>
                        Stock: {product.stock}
                      </span>
                    )}
                    {product.stock != null && product.stockStatus ? (
                      <span className="text-surface-600"> · </span>
                    ) : null}
                    {product.stockStatus && <span>{product.stockStatus}</span>}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
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
                </div>

                <aside className="flex flex-col gap-4 lg:sticky lg:top-16">
                  <div className="rounded-2xl border border-surface-800 bg-surface-900/80 overflow-hidden">
                    <div className="px-5 pt-5 pb-4 border-b border-surface-800">
                      <p className="text-[10px] uppercase tracking-wider text-surface-500 mb-1">
                        {displayTaxTitle({ withIva, withIibb, provider: providerName })}
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

                      {visibleTaxLines.filter((l) => l.unitAmount > 0.0001).map((line) => (
                        <BreakdownRow
                          key={`${line.kind}-${line.label}`}
                          label={`${line.label}${line.percent != null ? ` ${formatAlicuota(line.percent)}` : ""}`}
                          value={`+ ${money(line.unitAmount)}`}
                          muted
                        />
                      ))}
                      {estimatedIibbLine && (
                        <BreakdownRow
                          label={`${estimatedIibbLine.label}${estimatedIibbLine.percent != null ? ` ${formatAlicuota(estimatedIibbLine.percent)}` : ""}`}
                          value={`+ ${money(estimatedIibbLine.unitAmount)}`}
                          muted
                        />
                      )}
                      {withIibb &&
                        !estimatedIibbLine &&
                        !visibleTaxLines.some((l) => l.kind === "iibb" && l.unitAmount > 0.0001) &&
                        knownIibbPct == null && (
                          <p className="text-[10px] text-surface-600 leading-snug">
                            IIBB no disponible para este distribuidor hasta cotizar en el carrito.
                          </p>
                        )}
                      {visibleTaxLines.every((l) => l.unitAmount <= 0.0001) &&
                        !estimatedIibbLine &&
                        pricing.tax > 0 &&
                        withIva && (
                        <BreakdownRow label={taxLabel(product)} value={`+ ${money(pricing.tax / qty)}`} muted />
                      )}

                      <div className="border-t border-surface-800 pt-2.5 mt-1">
                        <BreakdownRow
                          label="Costo unitario final"
                          value={money(unitDisplayUsd)}
                          strong
                        />
                        {qty > 1 && (
                          <BreakdownRow
                            label={`Total × ${qty}`}
                            value={money(displayUSD)}
                            strong
                          />
                        )}
                      </div>
                      <p className="text-[10px] text-surface-600 leading-relaxed pt-1">
                        El desglose usa tu cotización y preferencias de impuestos
                        {withIibb ? " (incluye IIBB si se conoce)" : " (sin IIBB)"}
                        . El margen vs locales se calcula sobre el costo sin impuestos.
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

                      <ProductBuyActions product={product} qty={qty} />
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

              {(product.description || product.longDescription) && (
                <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-5">
                  <h2 className="text-sm font-semibold text-white mb-3">Descripción</h2>
                  {product.description && (
                    <p className="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap">
                      {product.description}
                    </p>
                  )}
                  {product.longDescription &&
                    product.longDescription !== product.description && (
                      <p className="text-sm text-surface-400 leading-relaxed whitespace-pre-wrap mt-3">
                        {product.longDescription}
                      </p>
                    )}
                </section>
              )}

              <ProductFactsGrid product={product} extId={extId} providerName={providerName} />

              <section className="rounded-2xl border border-surface-800 bg-surface-900/60 p-5">
                <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-400" />
                  Evolución de precio
                </h2>
                {priceHistory.length >= 2 ? (
                  <div className="h-56 sm:h-64">
                    <PriceHistoryChart points={priceHistory} fillHeight />
                  </div>
                ) : priceHistory.length === 1 ? (
                  <p className="text-xs text-surface-500 leading-relaxed">
                    Hay un único precio registrado ({formatUSD(Number(priceHistory[0].price) || 0)}).
                    El gráfico aparece cuando haya al menos un cambio en próximas sincronizaciones.
                  </p>
                ) : (
                  <p className="text-xs text-surface-500 leading-relaxed">
                    Todavía no hay variación registrada. El gráfico se arma cuando el precio cambie
                    en próximas sincronizaciones.
                  </p>
                )}
              </section>

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

            {/* Locales: footer separado, siempre debajo de TODO el producto (mobile incluido) */}
            <LocalesFooter seedQuery={product.name} costUsd={pricing.unitNet} />
          </>
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

function LocalesFooter({
  seedQuery,
  costUsd,
}: {
  seedQuery: string;
  costUsd: number;
}) {
  // En mobile arranca cerrado: la búsqueda de locales no invade el medio de la ficha.
  // En desktop (lg+) siempre abierta.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setOpen(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <section
      id="precios-locales"
      className="w-full border-t border-surface-800 bg-surface-950/80 mt-2"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-8 pb-16">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="lg:hidden w-full flex items-center justify-between gap-3 rounded-xl border border-surface-700 bg-surface-900 px-4 py-3.5 text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Store className="w-4 h-4 text-brand-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-white">Precios de venta en locales</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-surface-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        <div className={`${open ? "block mt-4 lg:mt-0" : "hidden"} lg:block`}>
          <SalePricePanel variant="inline" seedQuery={seedQuery} costUsd={costUsd} active={open} />
        </div>
      </div>
    </section>
  );
}

function ProductFactsGrid({
  product,
  extId,
  providerName,
}: {
  product: ProductDTO;
  extId: string;
  providerName: string;
}) {
  const facts = productFacts(product, extId, providerName);
  if (facts.length === 0) return null;
  const mid = Math.ceil(facts.length / 2);
  const columns = [facts.slice(0, mid), facts.slice(mid)];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {columns.map((col, colIdx) => (
        <section
          key={colIdx}
          className="rounded-2xl border border-surface-800 bg-surface-900/60 p-5"
        >
          <h2
            className={`text-sm font-semibold text-white mb-3 ${
              colIdx === 1 ? "md:invisible md:select-none" : ""
            }`}
          >
            {colIdx === 0 ? "Datos del producto" : "Más datos"}
          </h2>
          <dl className="space-y-0">
            {col.map((row) => (
              <MetaRow key={row.label} label={row.label}>
                {row.href ? (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-400 hover:text-brand-300 inline-flex items-center gap-1"
                  >
                    {row.value} <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span
                    className={`text-xs text-surface-200 ${row.mono ? "font-mono" : ""} ${row.strongColor ?? ""}`}
                  >
                    {row.value}
                  </span>
                )}
              </MetaRow>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function present(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

function formatDim(v: string | number | null | undefined): string | null {
  if (!present(v)) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isFinite(n)) return String(n);
  return String(v).trim();
}

function productFacts(
  product: ProductDTO,
  extId: string,
  providerName: string
): { label: string; value: string; mono?: boolean; href?: string; strongColor?: string }[] {
  const rows: { label: string; value: string; mono?: boolean; href?: string; strongColor?: string }[] = [];
  const push = (
    label: string,
    value: unknown,
    opts?: { mono?: boolean; href?: string; strongColor?: string }
  ) => {
    if (!present(value)) return;
    rows.push({ label, value: String(value).trim(), ...opts });
  };

  push("Proveedor", providerLabel(providerName));
  push("Marca", product.brand);
  push("Categoría", product.category);
  push("Subcategoría", product.subcategory);
  push("ID externo", extId, { mono: true });
  if (product.sku && product.sku !== extId) push("SKU", product.sku, { mono: true });
  push("Part number", product.partNumber, { mono: true });
  push("EAN", product.ean, { mono: true });
  if (product.stock != null) push("Stock", product.stock);
  push("Estado de stock", product.stockStatus);
  push("Ubicación / depósito", product.locationAir);
  push("Garantía", product.warranty);
  push("Impuestos detectados", taxLabel(product));
  if (product.ivaPercent != null && present(product.ivaPercent)) {
    push("IVA %", `${formatAlicuota(Number(product.ivaPercent))}`);
  }
  push("Moneda del proveedor", product.currency);

  const unit = product.weightUnit || "";
  if (present(product.weight)) {
    push("Peso", `${formatDim(product.weight)}${unit ? ` ${unit}` : ""}`);
  }

  const dims = [formatDim(product.height), formatDim(product.width), formatDim(product.length)].filter(
    Boolean
  ) as string[];
  if (dims.length) {
    const du = product.dimensionsUnit ? ` ${product.dimensionsUnit}` : "";
    push("Dimensiones (A×L×P)", `${dims.join(" × ")}${du}`);
  }
  if (present(product.volume)) push("Volumen", String(product.volume));
  push("Tags", product.tags);

  if (product.productUrl) {
    push("Ficha del proveedor", "Abrir enlace", { href: product.productUrl });
  }
  if (product.imageUrl) {
    push("Imagen original", "Ver imagen", { href: product.imageUrl });
  }
  if (product.syncedAt) {
    const d = new Date(product.syncedAt);
    if (!Number.isNaN(d.getTime())) {
      push(
        "Última sync",
        d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
      );
    }
  }

  return rows;
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
