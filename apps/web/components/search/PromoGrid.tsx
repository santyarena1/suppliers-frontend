"use client";

import Link from "next/link";
import type { Banner } from "@/lib/api";
import {
  BANNER_SLOT_COLLAGE,
  BANNER_SLOT_ORDER,
  BANNER_SLOT_RECOMMENDED,
  type BannerSlot,
} from "@/lib/brand-presets";
import { assetUrl } from "@/lib/assets";

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
  filled,
}: {
  slot: BannerSlot;
  children: React.ReactNode;
  filled: boolean;
}) {
  const layout = BANNER_SLOT_COLLAGE[slot];
  return (
    <div
      className={`${layout.mobile} ${layout.desktop} overflow-hidden border shadow-lg shadow-black/30 transition-transform duration-500 ${
        filled
          ? "border-surface-700/80 bg-surface-900 hover:z-50 hover:scale-[1.02]"
          : "border-dashed border-surface-700/70 bg-surface-950/40"
      }`}
    >
      {children}
    </div>
  );
}

function FilledBanner({ banner }: { banner: Banner }) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl(banner.imageUrl)}
        alt={banner.title || "Promoción"}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
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

  if (banner.linkUrl) {
    const external = banner.linkUrl.startsWith("http");
    return external ? (
      <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    ) : (
      <Link href={banner.linkUrl} className={cls}>{inner}</Link>
    );
  }

  return <div className={cls}>{inner}</div>;
}

function EmptyPlaceholder({ slot }: { slot: BannerSlot }) {
  const size = BANNER_SLOT_RECOMMENDED[slot];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center pointer-events-none">
      <span className="text-[10px] uppercase tracking-wider text-surface-600 font-semibold">
        {slot.replace("_", " ")}
      </span>
      <span className="text-[10px] text-surface-700">
        {size.width}×{size.height}
      </span>
    </div>
  );
}

type PromoGridProps = {
  banners: Banner[];
  /** Si true (default), reserva todos los slots aunque estén vacíos. */
  keepSlots?: boolean;
};

/**
 * Collage de banners: piezas giradas que se cruzan.
 * Cada slot mantiene su posición fija — si cargás uno solo, no se reacomoda.
 */
export default function PromoGrid({ banners, keepSlots = true }: PromoGridProps) {
  const bySlot = BANNER_SLOT_ORDER.map((slot) => ({
    slot,
    banner: pickBanner(banners, slot),
  }));

  const anyFilled = bySlot.some((s) => !!s.banner);
  if (!keepSlots && !anyFilled) return null;
  // Sin keepSlots y sin nada: no renderizar. Con keepSlots siempre mostramos el collage.

  return (
    <section className="mb-8">
      <div className="relative flex flex-col gap-0 md:block md:min-h-[460px] lg:min-h-[520px] md:pb-2">
        {bySlot.map(({ slot, banner }) => (
          <SlotShell key={slot} slot={slot} filled={!!banner}>
            {banner ? <FilledBanner banner={banner} /> : keepSlots ? <EmptyPlaceholder slot={slot} /> : null}
          </SlotShell>
        ))}
      </div>
    </section>
  );
}
