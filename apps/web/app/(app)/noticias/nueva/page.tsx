"use client";

import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import NewsEditor from "@/components/news/NewsEditor";
import { getTenant } from "@/lib/auth";
import "@/app/news.css";

export default function NuevaNoticiaPage() {
  const tenant = getTenant();
  const canWrite = tenant?.type === "DISTRIBUTOR" || tenant?.type === "BRAND";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-950">
      <header className="flex-shrink-0 border-b border-surface-800 px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/noticias" className="text-[13px] text-surface-400 hover:text-white">
          ← Noticias
        </Link>
        <PrefsPanel />
      </header>
      {canWrite ? (
        <NewsEditor />
      ) : (
        <p className="text-sm text-surface-400 px-6 py-10">Las noticias las publican marcas y distribuidores.</p>
      )}
    </div>
  );
}
