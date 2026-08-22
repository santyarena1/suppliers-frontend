"use client";

import Link from "next/link";
import type { Banner } from "@/lib/api";
import { BANNER_SLOT_GRID_CLASS, type BannerSlot } from "@/lib/brand-presets";

const SLOT_ORDER: BannerSlot[] = [
  "hero_main", "hero_side", "tile_1", "tile_2", "tile_3", "tile_4", "strip",
];

function BannerTile({ banner }: { banner: Banner }) {
  const slot = (banner.slot as BannerSlot) || "tile_1";
  const gridClass = BANNER_SLOT_GRID_CLASS[slot] ?? "min-h-[120px]";
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={banner.imageUrl}
        alt={banner.title || "Promoción"}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      {(banner.title || banner.subtitle) && (
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
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

  const cls = `group relative overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 ${gridClass}`;

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

export default function PromoGrid({ banners }: { banners: Banner[] }) {
  if (banners.length === 0) return null;

  const sorted = [...banners].sort((a, b) => {
    const ai = SLOT_ORDER.indexOf((a.slot as BannerSlot) || "tile_1");
    const bi = SLOT_ORDER.indexOf((b.slot as BannerSlot) || "tile_1");
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.order - b.order;
  });

  return (
    <section className="mb-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 auto-rows-min">
        {sorted.map((banner) => (
          <BannerTile key={banner.id} banner={banner} />
        ))}
      </div>
    </section>
  );
}
