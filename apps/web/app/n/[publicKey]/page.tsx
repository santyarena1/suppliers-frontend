"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Loader2 } from "lucide-react";
import NewsArticleView from "@/components/news/NewsArticleView";
import NodoLogo from "@/components/NodoLogo";
import NodoWordmark from "@/components/NodoWordmark";
import { publicNewsApi, type NewsDetail } from "@/lib/api";
import "@/app/news.css";

/** Nota pública: mismo sistema visual que la página de la marca, con vuelta a ella. */
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

  const brandPage = article?.author.publicPath ?? null;

  return (
    <div className="min-h-dvh bg-surface-950 text-white">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 opacity-90 hover:opacity-100">
            <NodoLogo className="h-6 w-6" />
            <NodoWordmark className="h-3" />
          </Link>
          {brandPage && article && (
            <Link
              href={brandPage}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-surface-300 transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Página de {article.author.name}
            </Link>
          )}
        </div>
      </header>

      {missing ? (
        <main className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="text-xl font-semibold">Esta nota no está disponible</h1>
          <p className="mt-2 text-sm text-surface-400">El enlace no existe o todavía no se publicó.</p>
        </main>
      ) : article ? (
        <main>
          <NewsArticleView article={article} />
          <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
            <div className="flex flex-col gap-3 rounded-xl bg-surface-900/70 px-5 py-4 ring-1 ring-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-white">¿Tenés un comercio?</p>
                <p className="mt-0.5 text-sm text-surface-400">
                  En NODO ves el stock de {article.author.name} en tus distribuidores y comprás en un solo lugar.
                </p>
              </div>
              <div className="flex flex-shrink-0 flex-wrap gap-2">
                {brandPage && (
                  <Link
                    href={brandPage}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
                  >
                    Ver la página de {article.author.name} <ArrowUpRight className="h-4 w-4" />
                  </Link>
                )}
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10 transition-colors hover:bg-white/10"
                >
                  Entrar a NODO
                </Link>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      )}
    </div>
  );
}
