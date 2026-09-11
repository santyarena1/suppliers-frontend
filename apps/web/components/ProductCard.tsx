"use client";

import {
  ProductDTO,
  PROVIDER_LABELS,
  productDisplayBrand,
  productDisplayCategory,
  type Provider,
} from "@/lib/api";
import { Check, DollarSign, GitCompare, ImageOff, MapPin, Package, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { proxyImg, formatARS, formatUSD } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { linePricing, formatAlicuota } from "@/lib/tax";
import { useProviderDisplay } from "@/lib/providerDisplay";
import { purchaseLinePricing, type PriceMode } from "@/lib/purchase-price";
import { usePurchasePolicy } from "@/lib/purchase";
import { applyPaymentOption, pricedPaymentOptions } from "@/lib/payment-options";
import { displayAmountFromPricing, displayTaxBadge, displayTaxTitle } from "@/lib/display-price";
import { useIibbRatesEpoch } from "@/lib/iibb-rates";
import {
  entryKey,
  loadCompareEntries,
  newProviderEntry,
  saveCompareEntries,
} from "@/lib/compare-store";
import AddToCartButton from "./AddToCartButton";
import SalePricePanel from "./SalePricePanel";
import ProductSyncedAt from "./ProductSyncedAt";
import { ListOverdueHint } from "@/components/list-import/ListFreshnessHints";

/**
 * Tarjeta de producto.
 *
 * Dos reglas que la ordenan:
 *
 * 1. Una sola moneda, la que el comercio eligió. Nada se muestra en la otra:
 *    ni el importe secundario ni la base sin impuestos.
 *
 * 2. Retícula fija. Cada dato vive siempre en el mismo renglón, tenga o no
 *    contenido, así una grilla se lee en columnas: todos los precios a la misma
 *    altura, todos los estados juntos. Lo que aparece y desaparece sin mover
 *    nada (baja, ubicación, imagen automática) va sobre la foto.
 *
 * Solo se muestra lo que el producto tiene: no hay etiquetas para decir que
 * algo no está.
 */

function ProviderPill({ provider }: { provider: string }) {
  const display = useProviderDisplay();
  const logoUrl = display.logoUrl(provider);
  const customColor = display.textColor(provider);
  const name = PROVIDER_LABELS[provider as Provider] ?? provider.replace(/_/g, " ");
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <span
      className="pc__prov"
      style={customColor ? ({ ["--pv"]: customColor } as React.CSSProperties) : undefined}
      title={name}
    >
      <span>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" />
        ) : (
          initials
        )}
      </span>
      {name}
    </span>
  );
}

export default function ProductCard({
  product,
  priceMode = "list",
}: {
  product: ProductDTO;
  priceMode?: PriceMode;
}) {
  const [imgErr, setImgErr] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [compareFlash, setCompareFlash] = useState(false);
  const { currency, withIva, withIibb, convert } = usePrefs();
  useIibbRatesEpoch();
  const policy = usePurchasePolicy(product.provider);
  const href = `/product/${encodeURIComponent(product.provider)}/${encodeURIComponent(product.externalId)}`;

  const brand = productDisplayBrand(product);
  const category = productDisplayCategory(product);

  const pricing = purchaseLinePricing(product, policy, priceMode);
  const includeIibb = withIibb && pricing.mode !== "offline";
  const shown = displayAmountFromPricing(pricing, {
    withIva,
    withIibb: includeIibb,
    provider: product.provider,
  });
  const displayUsd = shown.displayUsd;
  const listed = linePricing(product);
  const showingOffline = pricing.adjusted && pricing.mode === "offline";
  const showingScheme = pricing.adjusted && pricing.mode === "scheme";

  /** Todo importe de la tarjeta pasa por acá: una sola moneda, la elegida. */
  const money = (usd: number) => (currency === "USD" ? formatUSD(usd) : formatARS(convert(usd).amount));

  const primary = money(displayUsd);

  const canScheme = Boolean(policy?.acceptsScheme && policy.schemeIvaAdjustment);
  const schemeHint =
    priceMode === "list" && canScheme
      ? (() => {
          const sp = purchaseLinePricing(product, policy, "scheme");
          const sd = displayAmountFromPricing(sp, {
            withIva,
            withIibb: withIibb && sp.mode !== "offline",
            provider: product.provider,
          });
          const disc =
            policy.schemeDiscountPercent != null && policy.schemeDiscountPercent > 0
              ? ` (−${policy.schemeDiscountPercent}%)`
              : "";
          return `Esquema ${money(sd.displayUsd)}${disc}`;
        })()
      : null;

  /**
   * Precios por forma de pago. No tachan el precio de arriba: son otra opción
   * de compra, no un reemplazo. Un recargo sube y un descuento baja.
   */
  const payPrices = pricedPaymentOptions(policy?.paymentOptions).map((o) => ({
    id: o.id,
    label: o.label,
    kind: o.kind,
    text: `${o.label} ${money(applyPaymentOption(displayUsd, o))} (${o.kind === "SURCHARGE" ? "+" : "−"}${o.percent}%)`,
  }));

  const schemeDiscount =
    showingScheme && policy?.schemeDiscountPercent != null && policy.schemeDiscountPercent > 0
      ? `Descuento esquema ${policy.schemeDiscountPercent}%`
      : null;

  const hasDrop = product.priceDropPercent != null && product.priceDropPercent > 0;
  const dropLabel = hasDrop
    ? `−${product.priceDropPercent! % 1 === 0 ? product.priceDropPercent : product.priceDropPercent!.toFixed(1)}%`
    : null;
  const prevRaw = product.previousFinalPrice ?? product.previousPrice;
  const prevFormatted = hasDrop && prevRaw != null ? money(Number(prevRaw) || 0) : null;

  const taxOpts = { withIva, withIibb: includeIibb, provider: product.provider };
  const taxTitle = displayTaxTitle(taxOpts);

  /* El desglose: de dónde sale el número grande, en la misma moneda y en un
     solo renglón. Absorbe la pastilla de impuesto, que decía lo mismo. */
  const breakdown = (() => {
    const parts = [`Base ${money(listed.net)}`];
    // El badge arma IVA e internos. La percepción se agrega una sola vez acá,
    // con su marca de estimada, para no repetirla.
    parts.push(
      withIva ? displayTaxBadge(product, { ...taxOpts, withIibb: false }) : "sin imp.",
    );
    if (shown.iibbIncluded) {
      parts.push(
        `IIBB${shown.estimatedIibb ? " est." : ""}${
          shown.iibbPercent != null ? ` ${formatAlicuota(shown.iibbPercent)}` : ""
        }`,
      );
    }
    return parts.join(" · ");
  })();

  const stock = product.stock;
  const stockChip =
    stock != null && stock > 0
      ? { text: `${stock} u.`, tone: "yes" as const }
      : stock != null && stock <= 0
        ? { text: "Sin stock", tone: "none" as const }
        : product.stockStatus
          ? { text: product.stockStatus, tone: "none" as const }
          : null;

  function addToCompare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const entry = newProviderEntry(product, priceMode);
    const current = loadCompareEntries();
    const key = entryKey(entry);
    if (current.some((c) => entryKey(c) === key)) {
      setCompareFlash(true);
      setTimeout(() => setCompareFlash(false), 700);
      return;
    }
    saveCompareEntries([...current, entry]);
    setCompareFlash(true);
    setTimeout(() => setCompareFlash(false), 700);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("nodo-compare-updated"));
    }
  }

  return (
    <article className="pc group">
      <Link href={href} className="pc__shot">
        {product.imageUrl && !imgErr ? (
          <Image
            src={proxyImg(product.imageUrl)}
            alt={product.name}
            fill
            className="object-contain p-2 sm:p-3"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            unoptimized
            onError={() => setImgErr(true)}
          />
        ) : (
          <span className="pc__noimg">
            {imgErr ? <ImageOff className="w-8 h-8" /> : <Package className="w-8 h-8" />}
            Sin imagen
          </span>
        )}

        <ProviderPill provider={product.provider} />

        {dropLabel && <span className="pc__drop pc-mono">{dropLabel}</span>}

        {product.locationAir && (
          <span className="pc__loc pc-mono">
            <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
            {product.locationAir}
          </span>
        )}

        {product.imageAiSelected && product.imageUrl && !imgErr && (
          <span
            className="pc__ai pc-mono"
            title="Imagen elegida automáticamente, puede no corresponder"
          >
            <Sparkles className="w-2.5 h-2.5" />
            IA
          </span>
        )}
      </Link>

      <div className="pc__body">
        <Link href={href} className="pc__name">
          {product.name}
        </Link>

        <p className="pc__meta">
          {brand && (
            <Link
              href={`/search?marca=${encodeURIComponent(brand)}`}
              onClick={(e) => e.stopPropagation()}
            >
              {brand}
            </Link>
          )}
          {brand && category ? " · " : ""}
          {category && (
            <Link
              href={`/search?categoria=${encodeURIComponent(category)}`}
              onClick={(e) => e.stopPropagation()}
            >
              {category}
            </Link>
          )}
        </p>

        <p className="pc__price">
          <span className="pc__amount pc-mono">{primary}</span>
          {prevFormatted && (
            <span className="pc__prev pc-mono" title="Precio de la sincronización anterior">
              antes <s>{prevFormatted}</s>
            </span>
          )}
        </p>

        <p className="pc__base pc-mono" title={taxTitle}>
          {breakdown}
        </p>

        {/* Un solo renglón de aviso, siempre presente aunque esté vacío */}
        <p className="pc__aside pc-mono">
          {pricing.missingIva && (showingOffline || showingScheme) ? (
            <span className="is-warn">Sin alícuota de IVA</span>
          ) : schemeHint ? (
            <span className="is-alt">{schemeHint}</span>
          ) : schemeDiscount ? (
            <span className="is-alt">{schemeDiscount}</span>
          ) : null}
        </p>

        {/* Formas de pago: fila fija, vacía cuando el distribuidor no tiene */}
        <p className="pc__pay pc-mono" title={payPrices.map((p) => p.text).join(" · ")}>
          {payPrices.slice(0, 2).map((p) => (
            <span
              key={p.id}
              className={p.kind === "SURCHARGE" ? "is-up" : "is-down"}
            >
              {p.text}
            </span>
          ))}
        </p>

        <div className="pc__flags">
          {stockChip && (
            <span className={`pc__flag pc__flag--${stockChip.tone}`}>
              {stockChip.tone === "yes" && <Check className="w-2.5 h-2.5" strokeWidth={2.4} />}
              {stockChip.text}
            </span>
          )}
          {showingOffline && <span className="pc__flag pc__flag--on">Offline</span>}
          {showingScheme && <span className="pc__flag pc__flag--alt">Esquema</span>}
        </div>

        <div className="pc__foot">
          <span className="pc__id pc-mono" title="Código del distribuidor">
            {product.externalId ? `#${product.externalId}` : "—"}
          </span>

          <div className="pc__acts">
            <button
              type="button"
              title="Agregar al comparador"
              aria-label="Agregar al comparador"
              onClick={addToCompare}
              className={`pc__ghost${compareFlash ? " is-on" : ""}`}
            >
              {compareFlash ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <GitCompare className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              title="Ver precios de venta en locales (referencia de mercado)"
              aria-label="Ver precios de venta"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSaleOpen(true);
              }}
              className="pc__ghost"
            >
              <DollarSign className="w-3.5 h-3.5" />
            </button>
            <AddToCartButton
              product={product}
              variant="stepper"
              tone="light"
              channel={showingOffline ? "offline" : "online"}
            />
          </div>
        </div>

        <div className="pc__sync pc-mono">
          <ProductSyncedAt syncedAt={product.syncedAt} className="pc__sync-line" />
          <ListOverdueHint provider={product.provider} className="pc__sync-warn" />
        </div>
      </div>

      <SalePricePanel
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        seedQuery={product.name}
        costUsd={displayUsd}
      />
    </article>
  );
}
