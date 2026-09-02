"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PrefsPanel from "@/components/PrefsPanel";
import NewsEditor from "@/components/news/NewsEditor";
import { newsApi, type NewsDetail } from "@/lib/api";
import "@/app/news.css";

export default function EditarNoticiaPage() {
  const params = useParams<{ id: string }>();
  const [article, setArticle] = useState<NewsDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    newsApi
      .getMine(params.id)
      .then((res) => setArticle(res.data))
      .catch(() => setMissing(true));
  }, [params.id]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-950">
      <header className="flex-shrink-0 border-b border-surface-800 px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/noticias" className="text-[13px] text-surface-400 hover:text-white">
          ← Noticias
        </Link>
        <PrefsPanel />
      </header>
      {missing ? (
        <p className="text-sm text-surface-400 px-6 py-10">No se puede editar esa nota.</p>
      ) : article ? (
        <NewsEditor article={article} />
      ) : (
        <p className="text-sm text-surface-500 px-6 py-10">Cargando…</p>
      )}
    </div>
  );
}
