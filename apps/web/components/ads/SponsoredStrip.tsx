"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adsApi, type AdCreative } from "@/lib/api";
import { trackAdClick, trackAdImpression } from "./ad-track";

/**
 * Fila paga arriba de los resultados. Solo aparece si alguien contrató
 * el espacio `search_sponsored` y la campaña está activa.
 */
export default function SponsoredStrip() {
  const [ads, setAds] = useState<AdCreative[]>([]);

  useEffect(() => {
    adsApi
      .creatives("search")
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setAds(rows.filter((row) => row.slot === "search_sponsored").slice(0, 3));
      })
      .catch(() => setAds([]));
  }, []);

  useEffect(() => {
    for (const ad of ads) trackAdImpression(ad.campaignId);
  }, [ads]);

  if (ads.length === 0) return null;

  return (
    <section className="mb-4 flex flex-col gap-2">
      {ads.map((ad) => (
        <SponsoredCard key={ad.campaignId} ad={ad} />
      ))}
    </section>
  );
}

function SponsoredCard({ ad }: { ad: AdCreative }) {
  const href = ad.linkUrl?.trim() || "";
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/90">Patrocinado</p>
        <p className="text-sm font-medium text-white truncate">{ad.title}</p>
        {(ad.subtitle || ad.advertiser) && (
          <p className="text-[11px] text-surface-400 truncate">{ad.subtitle || ad.advertiser}</p>
        )}
      </div>
    </div>
  );

  const cls =
    "block border border-amber-500/20 bg-amber-500/5 hover:border-amber-400/40 rounded-xl overflow-hidden transition-colors";

  if (!href) {
    return <div className={cls}>{inner}</div>;
  }

  const external = href.startsWith("http");
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        onClick={() => trackAdClick(ad.campaignId)}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} className={cls} onClick={() => trackAdClick(ad.campaignId)}>
      {inner}
    </Link>
  );
}
