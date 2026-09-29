"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import NewsEditor, { type NewsDraftSeed } from "@/components/news/NewsEditor";
import type { NewsKind } from "@/lib/api";
import { getTenant } from "@/lib/auth";
import { NEWS_KIND_ORDER, canWriteNews } from "@/lib/news";
import "@/app/news.css";

export default function NuevaNoticiaPage() {
  const tenant = getTenant();
  const canWrite = canWriteNews(tenant);
  // ?tipo=LAUNCH&producto=<id>: "Crear lanzamiento" desde los productos de la marca.
  const [seed, setSeed] = useState<NewsDraftSeed | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get("tipo") as NewsKind | null;
    setSeed({
      kind: kind && NEWS_KIND_ORDER.includes(kind) ? kind : undefined,
      brandItemId: params.get("producto") ?? undefined,
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-950">
      <header className="flex-shrink-0 border-b border-surface-800 px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/noticias" className="text-[13px] text-surface-400 hover:text-white">
          ← Noticias
        </Link>
        <PrefsPanel />
      </header>
      {canWrite ? (
        seed && <NewsEditor seed={seed} />
      ) : (
        <p className="text-sm text-surface-400 px-6 py-10">Las noticias las publican marcas y distribuidores.</p>
      )}
    </div>
  );
}
