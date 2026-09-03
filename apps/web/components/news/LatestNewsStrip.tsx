"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { newsApi, type NewsCard } from "@/lib/api";
import { canWriteNews } from "@/lib/news";
import { getTenant } from "@/lib/auth";

export default function LatestNewsStrip() {
  const tenant = getTenant();
  const canWrite = canWriteNews(tenant);
  const [items, setItems] = useState<NewsCard[]>([]);

  useEffect(() => {
    newsApi
      .mine()
      .then((res) => setItems(res.data.items ?? []))
      .catch(() => setItems([]));
  }, []);

  const published = items.filter((item) => item.status === "PUBLISHED").slice(0, 3);
  if (published.length === 0 && !canWrite) return null;

  return (
    <section className="border border-surface-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
        <h2 className="text-xs font-semibold text-white">Últimas notas</h2>
        <div className="flex items-center gap-3">
          {canWrite && (
            <Link href="/noticias/nueva" className="text-[11px] text-white hover:text-brand-300">
              Nueva
            </Link>
          )}
          <Link href="/noticias" className="text-[11px] text-brand-400 hover:text-brand-300">
            Ver todas
          </Link>
        </div>
      </div>
      {published.length === 0 ? (
        <p className="text-[12px] text-surface-500 px-4 py-4">Todavía no publicaron nada. La primera nota arma el medio.</p>
      ) : (
        published.map((item) => (
          <Link
            key={item.id}
            href={`/noticias/${item.id}`}
            className="flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-surface-900/60 border-t border-surface-800 first:border-t-0"
          >
            <span className="text-sm text-surface-200 truncate">{item.title}</span>
            <span className="text-[11px] text-surface-500 whitespace-nowrap">
              {item.stats ? `${item.stats.views} vistas` : ""}
            </span>
          </Link>
        ))
      )}
    </section>
  );
}
