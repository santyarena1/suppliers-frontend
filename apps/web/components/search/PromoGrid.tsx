"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adsApi, type AdCreative, type Banner } from "@/lib/api";
import {
  BANNER_BENTO_CONTAINER,
  BANNER_BENTO_SECONDARY_CONTAINER,
  BANNER_SLOT_BENTO,
  BANNER_SLOT_ORDER_PRIMARY,
  BANNER_SLOT_ORDER_SECONDARY,
  type BannerSlot,
} from "@/lib/brand-presets";
import { assetUrl } from "@/lib/assets";
import { demoFillForSlot, type BrandDemo, type CategoryDemo } from "@/lib/demoBanners";
import BrandBanner from "./banners/BrandBanner";
import CategoryBanner from "./banners/CategoryBanner";
import { trackAdClick, trackAdImpression } from "@/components/ads/ad-track";

function pickBanner(banners: Banner[], slot: BannerSlot): Banner | undefined {
  const matches = banners.filter(
    (b) => b.active !== false && !!b.imageUrl?.trim() && (b.slot as BannerSlot) === slot,
  );
  if (matches.length === 0) return undefined;
  return [...matches].sort((a, b) => a.order - b.order)[0];
}

function SlotShell({
  slot,
  children,
}: {
  slot: BannerSlot;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${BANNER_SLOT_BENTO[slot]} relative overflow-hidden rounded-2xl border border-surface-700/80 bg-surface-900 transition-transform duration-300 hover:scale-[1.01]`}
    >
      {children}
    </div>
  );
}

function FilledBanner({
  banner,
  isDemo,
  campaignId,
}: {
  banner: Banner;
  isDemo?: boolean;
  campaignId?: string;
}) {
  useEffect(() => {
    if (campaignId) trackAdImpression(campaignId);
  }, [campaignId]);

  const inner = (
    <>
      {banner.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetUrl(banner.imageUrl)}
          alt={banner.title || "Promoción"}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-700/40 via-surface-900 to-surface-950" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
      {campaignId && !isDemo && (
        <span className="absolute top-2 right-2 z-10 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/80 text-black">
          Patrocinado
        </span>
      )}
      {(banner.title || banner.subtitle) && (
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
          {banner.title && (
            <p className="text-white text-sm sm:text-base font-bold leading-tight drop-shadow-md">
              {banner.title}
            </p>
          )}
          {banner.subtitle && (
            <p className="text-white/85 text-xs sm:text-sm mt-1 line-clamp-2">{banner.subtitle}</p>
          )}
        </div>
      )}
    </>
  );

  const cls = "group absolute inset-0 block";
  const onPaidClick = campaignId ? () => trackAdClick(campaignId) : undefined;

  if (banner.linkUrl && !isDemo) {
    const external = banner.linkUrl.startsWith("http");
    return external ? (
      <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className={cls} onClick={onPaidClick}>
        {inner}
      </a>
    ) : (
      <Link href={banner.linkUrl} className={cls} onClick={onPaidClick}>{inner}</Link>
    );
  }

  return <div className={cls}>{inner}</div>;
}

function paidAsBanner(creative: AdCreative, slot: BannerSlot): Banner {
  return {
    id: creative.campaignId,
    position: "search",
    slot,
    imageUrl: creative.imageUrl ?? "",
    title: creative.title,
    subtitle: creative.subtitle || `Patrocinado · ${creative.advertiser}`,
    linkUrl: creative.linkUrl,
    order: 0,
    active: true,
  };
}

type ResolvedSlot = {
  slot: BannerSlot;
  /** Imagen a mostrar: campaña, banner real o banda NODO de demo. */
  banner?: Banner;
  /** Mosaico demo armado como componente (marca o categoría). */
  mosaic?: BrandDemo | CategoryDemo;
  isDemo: boolean;
  campaignId?: string;
};

const isVisible = (s: ResolvedSlot) => !!s.banner || !!s.mosaic;

type PromoGridProps = {
  banners: Banner[];
  /** Si true (default), rellena slots vacíos con los mosaicos de demo. */
  useDemoFill?: boolean;
  /**
   * Qué módulo dibujar. Se puede pedir uno solo para intercalar contenido en el
   * medio: con los dos seguidos arriba, había que bajar demasiado para llegar a
   * las bajas de precio, que es a lo que la gente entra.
   */
  module?: "primary" | "secondary" | "both";
};

/**
 * Bento de banners: tamaños distintos, gaps uniformes, sin solapes.
 * Cada slot mantiene su posición; si no hay banner real, se muestra uno de demo.
 */
export default function PromoGrid({ banners, useDemoFill = true, module = "both" }: PromoGridProps) {
  const [paid, setPaid] = useState<AdCreative[]>([]);

  useEffect(() => {
    adsApi
      .creatives("search")
      .then((res) => setPaid(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPaid([]));
  }, []);

  /** Prioridad: campaña paga → banner real del admin → relleno demo. */
  function resolveSlot(slot: BannerSlot): ResolvedSlot {
    const paidMatch = paid.find((creative) => creative.slot === slot);
    if (paidMatch) {
      return { slot, banner: paidAsBanner(paidMatch, slot), isDemo: false, campaignId: paidMatch.campaignId };
    }
    const real = pickBanner(banners, slot);
    if (real) return { slot, banner: real, isDemo: false };
    if (!useDemoFill) return { slot, isDemo: false };
    const fill = demoFillForSlot(slot);
    if (fill.kind === "image") return { slot, banner: fill.banner, isDemo: true };
    return { slot, mosaic: fill, isDemo: true };
  }

  const primary = BANNER_SLOT_ORDER_PRIMARY.map(resolveSlot);
  const secondary = BANNER_SLOT_ORDER_SECONDARY.map(resolveSlot);
  if (![...primary, ...secondary].some(isVisible)) return null;

  function renderModule(items: ResolvedSlot[], containerClass: string, keyPrefix: string) {
    if (!items.some(isVisible)) return null;
    return (
      <div key={keyPrefix} className={containerClass}>
        {items.map(({ slot, banner, mosaic, isDemo, campaignId }) => {
          if (mosaic) {
            return (
              <SlotShell key={slot} slot={slot}>
                {mosaic.kind === "brand" ? <BrandBanner demo={mosaic} /> : <CategoryBanner demo={mosaic} />}
              </SlotShell>
            );
          }
          if (!banner) return null;
          return (
            <SlotShell key={slot} slot={slot}>
              <FilledBanner banner={banner} isDemo={isDemo} campaignId={campaignId} />
            </SlotShell>
          );
        })}
      </div>
    );
  }

  return (
    <section className="mb-6 space-y-4">
      {module !== "secondary" && renderModule(primary, BANNER_BENTO_CONTAINER, "primary")}
      {module !== "primary" && renderModule(secondary, BANNER_BENTO_SECONDARY_CONTAINER, "secondary")}
    </section>
  );
}
