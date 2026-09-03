"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NewsArticleView from "@/components/news/NewsArticleView";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import { publicNewsApi, type NewsDetail } from "@/lib/api";
import "@/app/news.css";

export default function PublicNewsPage() {
  const params = useParams<{ publicKey: string }>();
  const [article, setArticle] = useState<NewsDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!params.publicKey) return;
    publicNewsApi
      .get(params.publicKey)
      .then((res) => setArticle(res.data))
      .catch(() => setMissing(true));
  }, [params.publicKey]);

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#111] news-paper">
      <header className="border-b border-[#ddd8cc] px-4 sm:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 opacity-80 hover:opacity-100">
          <NodoLogo className="w-5 h-5" />
          <NodoWordmark className="h-2.5" />
        </Link>
        <span className="text-[11px] tracking-[0.14em] uppercase text-[#7a7466]">Nota</span>
      </header>
      {missing ? (
        <main className="max-w-lg mx-auto px-4 py-24 text-center">
          <h1 className="news-serif text-2xl">Esta nota no está disponible</h1>
          <p className="text-sm text-[#6b665c] mt-2">El enlace no existe o todavía no se publicó.</p>
        </main>
      ) : article ? (
        <>
          <NewsArticleView article={article} paper />
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              className="text-[13px] underline underline-offset-4 text-[#111]"
            >
              Entrar a NODO
            </Link>
            <Link
              href={`/noticias/${article.id}`}
              className="text-[13px] text-[#6b665c] hover:text-[#111]"
            >
              Abrir en la red
            </Link>
          </div>
        </>
      ) : (
        <p className="text-center text-sm text-[#6b665c] py-24">Cargando…</p>
      )}
    </div>
  );
}
