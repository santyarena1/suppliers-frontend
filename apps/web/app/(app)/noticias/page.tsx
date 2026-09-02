"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import NewsByline from "@/components/news/NewsByline";
import NewsHero from "@/components/news/NewsHero";
import NewsKindMark from "@/components/news/NewsKindMark";
import NewsPhoto from "@/components/news/NewsPhoto";
import { getTenant } from "@/lib/auth";
import { newsApi, type NewsCard, type NewsHeroSlide, type NewsKind } from "@/lib/api";
import { NEWS_KIND_LABELS, NEWS_KIND_ORDER } from "@/lib/news";
import "@/app/news.css";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export default function NoticiasPage() {
  const tenant = getTenant();
  const canWrite = tenant?.type === "DISTRIBUTOR" || tenant?.type === "BRAND";
  const [slides, setSlides] = useState<NewsHeroSlide[]>([]);
  const [items, setItems] = useState<NewsCard[]>([]);
  const [mine, setMine] = useState<NewsCard[]>([]);
  const [kind, setKind] = useState<string>("");
  const [authorType, setAuthorType] = useState<string>("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      newsApi.hero(),
      newsApi.feed({ kind: kind || undefined, authorType: authorType || undefined, q: q || undefined, take: 30 }),
      canWrite ? newsApi.mine().catch(() => ({ data: { items: [] as NewsCard[] } })) : Promise.resolve({ data: { items: [] as NewsCard[] } }),
    ])
      .then(([hero, feed, own]) => {
        if (cancelled) return;
        setSlides(hero.data.slides);
        setItems(feed.data.items);
        setMine(own.data.items ?? []);
      })
      .catch((err) => setAviso(errMsg(err, "No se pudieron cargar las noticias")))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, authorType, q, canWrite]);

  const drafts = useMemo(() => mine.filter((n) => n.status && n.status !== "PUBLISHED"), [mine]);
  const lead = items[0];
  const rest = items.slice(1);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-950">
      <header className="flex-shrink-0 border-b border-surface-800 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="news-serif text-xl text-white tracking-tight">Noticias</h1>
          <p className="text-[11px] text-surface-500 hidden sm:block">
            Novedades de tu red. Cada nota es de quien la publica.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canWrite && (
            <Link href="/noticias/nueva" className="text-[13px] text-white border border-surface-600 px-3 py-1.5 hover:bg-white hover:text-black">
              Nueva nota
            </Link>
          )}
          <PrefsPanel />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {aviso && <p className="text-sm text-red-400 px-6 py-4">{aviso}</p>}
        <NewsHero slides={slides} />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-wrap items-end gap-3 justify-between mb-8">
            <div className="flex flex-wrap gap-2 text-[12px]">
              <FilterChip active={!kind} onClick={() => setKind("")}>
                Todas
              </FilterChip>
              {NEWS_KIND_ORDER.map((k) => (
                <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
                  {NEWS_KIND_LABELS[k as NewsKind]}
                </FilterChip>
              ))}
              {tenant?.type === "RETAILER" && (
                <>
                  <span className="w-px h-4 bg-surface-700 mx-1 self-center" />
                  <FilterChip active={authorType === "BRAND"} onClick={() => setAuthorType(authorType === "BRAND" ? "" : "BRAND")}>
                    Marcas
                  </FilterChip>
                  <FilterChip
                    active={authorType === "DISTRIBUTOR"}
                    onClick={() => setAuthorType(authorType === "DISTRIBUTOR" ? "" : "DISTRIBUTOR")}
                  >
                    Distribuidores
                  </FilterChip>
                </>
              )}
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar"
              className="bg-transparent border-b border-surface-700 text-sm text-white placeholder-surface-600 py-1 w-40 focus:outline-none focus:border-white/40"
            />
          </div>

          {drafts.length > 0 && (
            <p className="text-[13px] text-surface-400 mb-8">
              Tenés {drafts.length} {drafts.length === 1 ? "borrador" : "borradores"}.{" "}
              <Link href={`/noticias/${drafts[0].id}/editar`} className="underline underline-offset-4">
                Seguir el último
              </Link>
            </p>
          )}

          {loading ? (
            <p className="text-sm text-surface-500 py-16">Cargando edición…</p>
          ) : items.length === 0 ? (
            <Empty canWrite={canWrite} />
          ) : (
            <>
              {lead && (
                <Link href={`/noticias/${lead.id}`} className="grid md:grid-cols-12 gap-6 md:gap-10 group mb-14">
                  <div className="md:col-span-7 aspect-[16/10] overflow-hidden bg-surface-900">
                    <NewsPhoto src={lead.coverUrl} alt={lead.title} className="transition-transform duration-700 group-hover:scale-[1.02]" />
                  </div>
                  <div className="md:col-span-5 flex flex-col justify-center">
                    <NewsKindMark kind={lead.kind} />
                    <h2 className="news-serif text-3xl sm:text-4xl text-white tracking-tight leading-[1.1] mt-2 group-hover:opacity-90">
                      {lead.title}
                    </h2>
                    {lead.excerpt && <p className="mt-3 text-surface-300 leading-relaxed">{lead.excerpt}</p>}
                    <NewsByline author={lead.author} date={lead.publishedAt} advertised={!lead.linked} />
                  </div>
                </Link>
              )}

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
                {rest.map((item) => (
                  <Link key={item.id} href={`/noticias/${item.id}`} className="group">
                    <div className="aspect-[16/10] overflow-hidden bg-surface-900 mb-3">
                      <NewsPhoto src={item.coverUrl} alt={item.title} className="transition-transform duration-700 group-hover:scale-[1.03]" />
                    </div>
                    <NewsKindMark kind={item.kind} />
                    <h3 className="news-serif text-[22px] text-white leading-tight mt-1.5 group-hover:opacity-90">
                      {item.title}
                    </h3>
                    {item.excerpt && (
                      <p className="mt-2 text-[13.5px] text-surface-400 line-clamp-2 leading-relaxed">{item.excerpt}</p>
                    )}
                    <NewsByline author={item.author} date={item.publishedAt} advertised={!item.linked} compact />
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-0 py-1 ${active ? "text-white" : "text-surface-500 hover:text-surface-200"}`}
    >
      {children}
    </button>
  );
}

function Empty({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="py-20 max-w-md">
      <p className="news-serif text-2xl text-white">Todavía no hay notas en tu red.</p>
      <p className="text-sm text-surface-400 mt-3 leading-relaxed">
        {canWrite
          ? "Publicá la primera. Una portada grande y un cuerpo con HTML propio alcanzan para que se sienta de ustedes."
          : "Cuando una marca o un distribuidor vinculado publique, aparece acá. Si pagan publicidad, también las ves aunque todavía no estén vinculados."}
      </p>
      {canWrite && (
        <Link href="/noticias/nueva" className="inline-block mt-6 text-sm underline underline-offset-4 text-white">
          Escribir una nota
        </Link>
      )}
    </div>
  );
}
