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
import { demoBannerForSlot } from "@/lib/demoBanners";
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
      {isDemo && (
        <span className="absolute top-2 right-2 z-10 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/60 text-white/80 border border-white/15">
          Demo
        </span>
      )}
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

type PromoGridProps = {
  banners: Banner[];
  /** Si true (default), rellena slots vacíos con imágenes de demo. */
  useDemoFill?: boolean;
};

/**
 * Bento de banners: tamaños distintos, gaps uniformes, sin solapes.
 * Cada slot mantiene su posición; si no hay banner real, se muestra uno de demo.
 */
export default function PromoGrid({ banners, useDemoFill = true }: PromoGridProps) {
  const [paid, setPaid] = useState<AdCreative[]>([]);

  useEffect(() => {
    adsApi
      .creatives("search")
      .then((res) => setPaid(Array.isArray(res.data) ? res.data : []))
      .catch(() => setPaid([]));
  }, []);

  function resolveSlot(slot: BannerSlot) {
    const paidMatch = paid.find((creative) => creative.slot === slot);
    if (paidMatch) {
      return { slot, banner: paidAsBanner(paidMatch, slot), isDemo: false, campaignId: paidMatch.campaignId };
    }
    const real = pickBanner(banners, slot);
    if (real) return { slot, banner: real, isDemo: false, campaignId: undefined };
    if (useDemoFill) return { slot, banner: demoBannerForSlot(slot), isDemo: true, campaignId: undefined };
    return { slot, banner: undefined, isDemo: false, campaignId: undefined };
  }

  const primary = BANNER_SLOT_ORDER_PRIMARY.map(resolveSlot);
  const secondary = BANNER_SLOT_ORDER_SECONDARY.map(resolveSlot);
  const anyVisible = [...primary, ...secondary].some((s) => !!s.banner);
  if (!anyVisible) return null;

  function renderModule(
    items: ReturnType<typeof resolveSlot>[],
    containerClass: string,
    keyPrefix: string,
  ) {
    const visible = items.filter((s) => !!s.banner);
    if (visible.length === 0) return null;
    return (
      <div key={keyPrefix} className={containerClass}>
        {items.map(({ slot, banner, isDemo, campaignId }) =>
          banner ? (
            <SlotShell key={slot} slot={slot}>
              <FilledBanner banner={banner} isDemo={isDemo} campaignId={campaignId} />
            </SlotShell>
          ) : null,
        )}
      </div>
    );
  }

  return (
    <section className="mb-6 space-y-4">
      {renderModule(primary, BANNER_BENTO_CONTAINER, "primary")}
      {renderModule(secondary, BANNER_BENTO_SECONDARY_CONTAINER, "secondary")}
    </section>
  );
}
