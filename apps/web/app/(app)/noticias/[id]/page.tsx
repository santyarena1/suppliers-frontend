"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PrefsPanel from "@/components/PrefsPanel";
import NewsArticleView from "@/components/news/NewsArticleView";
import { getTenant } from "@/lib/auth";
import { newsApi, type NewsDetail } from "@/lib/api";
import "@/app/news.css";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export default function NoticiaPage() {
  const params = useParams<{ id: string }>();
  const tenant = getTenant();
  const [article, setArticle] = useState<NewsDetail | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const mine = Boolean(article && tenant && article.author.tenantId === tenant.id);

  useEffect(() => {
    if (!params.id) return;
    newsApi
      .get(params.id)
      .then((res) => setArticle(res.data))
      .catch((err) => setAviso(errMsg(err, "No se encontró la nota")));
  }, [params.id]);

  async function copyLink() {
    if (!article) return;
    const path = article.publicPath || `/noticias/${article.id}`;
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
  }

  function shareWhatsapp() {
    if (!article) return;
    const path = article.publicPath || `/noticias/${article.id}`;
    const url = `${window.location.origin}${path}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(`${article.title} ${url}`)}`, "_blank");
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-950">
      <header className="flex-shrink-0 border-b border-surface-800 px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/noticias" className="text-[13px] text-surface-400 hover:text-white">
          ← Noticias
        </Link>
        <div className="flex items-center gap-3">
          {article && (
            <>
              <button type="button" onClick={() => void copyLink()} className="text-[12px] text-surface-400 hover:text-white">
                Copiar enlace
              </button>
              <button type="button" onClick={shareWhatsapp} className="text-[12px] text-surface-400 hover:text-white">
                WhatsApp
              </button>
              {mine && article.stats && (
                <span className="text-[12px] text-surface-500">
                  {article.stats.views} vistas · {article.stats.attachmentClicks} descargas
                </span>
              )}
              {mine && article.author.linked !== false && (
                <Link href={`/noticias/${article.id}/editar`} className="text-[12px] text-white">
                  Editar
                </Link>
              )}
              {article.author.linked && tenant?.type === "RETAILER" && (
                <Link href="/mensajes" className="text-[12px] text-white">
                  Hablar
                </Link>
              )}
              {article.author.advertised && !article.author.linked && tenant?.type === "RETAILER" && (
                <Link href="/proveedores" className="text-[12px] text-white">
                  Conectate con un código
                </Link>
              )}
            </>
          )}
          <PrefsPanel />
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        {aviso && <p className="text-sm text-red-400 px-6 py-10">{aviso}</p>}
        {article && <NewsArticleView article={article} trackViews />}
      </div>
    </div>
  );
}
