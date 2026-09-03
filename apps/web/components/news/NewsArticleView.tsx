"use client";

import { useEffect } from "react";
import Link from "next/link";
import { assetUrl } from "@/lib/assets";
import { newsApi, type NewsDetail } from "@/lib/api";
import { authorTypeLabel, formatNewsDate } from "@/lib/news";
import { useProviderDisplay } from "@/lib/providerDisplay";
import NewsHtmlBody from "./NewsHtmlBody";
import NewsKindMark from "./NewsKindMark";
import NewsPhoto from "./NewsPhoto";

export default function NewsArticleView({
  article,
  paper,
  trackViews,
}: {
  article: NewsDetail;
  paper?: boolean;
  trackViews?: boolean;
}) {
  useEffect(() => {
    if (trackViews) void newsApi.track(article.id, "view");
  }, [article.id, trackViews]);

  const display = useProviderDisplay();
  const logo = article.author.logoUrl || (article.author.providerKey ? display.logoUrl(article.author.providerKey) : null);
  const ink = paper ? "text-[#111]" : "text-white";
  const mute = paper ? "text-[#5c5c5c]" : "text-surface-400";

  return (
    <article>
      <header className="relative">
        <div className="relative h-[52vh] min-h-[340px] max-h-[640px] bg-black">
          <NewsPhoto src={article.coverUrl} alt={article.title} className="absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-28 relative z-10">
          <NewsKindMark kind={article.kind} light />
          <h1 className="news-serif text-4xl sm:text-5xl font-semibold text-white tracking-tight leading-[1.08] mt-2 text-balance">
            {article.title}
          </h1>
          {article.excerpt && (
            <p className="mt-4 text-lg text-white/75 leading-relaxed">{article.excerpt}</p>
          )}
          <div className="flex items-center gap-3 mt-6 pb-8">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/15">
              {logo ? (
                <NewsPhoto src={logo} alt="" className="object-contain bg-white" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-xs text-white/70">
                  {article.author.name.slice(0, 1)}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm text-white">{article.author.name}</p>
              <p className="text-[12px] text-white/55">
                {authorTypeLabel(article.author.type)}
                {article.publishedAt ? ` · ${formatNewsDate(article.publishedAt)}` : ""}
                {article.author.advertised ? " · Publicidad" : ""}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className={`max-w-3xl mx-auto px-4 sm:px-6 ${paper ? "py-2" : "pb-10"}`}>
        {article.author.hubPath && (
          <BrandSpaceLinks hubPath={article.author.hubPath} brandName={article.author.name} paper={paper} />
        )}
        <NewsHtmlBody html={article.bodyHtml} paper={paper} />

        {article.images.length > 0 && (
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {article.images.map((img) => (
              <figure key={img.id} className="m-0">
                <div className="aspect-[4/3] overflow-hidden bg-black/20">
                  <NewsPhoto src={img.url} alt={img.caption || article.title} />
                </div>
                {img.caption && <figcaption className={`text-[12px] mt-2 ${mute}`}>{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}

        {article.attachments.length > 0 && (
          <aside className={`mt-12 pt-6 border-t ${paper ? "border-[#ddd8cc]" : "border-surface-800"}`}>
            <p className={`text-[10px] uppercase tracking-[0.16em] mb-3 ${mute}`}>Archivos</p>
            <ul className="flex flex-col gap-2">
              {article.attachments.map((file) => {
                const href = file.fileUrl ? assetUrl(file.fileUrl) : file.contentUrl;
                return (
                  <li key={file.id}>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => trackViews && newsApi.track(article.id, "attachment_click")}
                        className={`text-sm underline underline-offset-4 ${ink}`}
                      >
                        {file.title}
                      </a>
                    ) : (
                      <span className={`text-sm ${mute}`}>{file.title}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>
        )}

        {article.relatedSkus.length > 0 && (
          <aside className={`mt-8 pt-6 border-t ${paper ? "border-[#ddd8cc]" : "border-surface-800"}`}>
            <p className={`text-[10px] uppercase tracking-[0.16em] mb-3 ${mute}`}>En el catálogo</p>
            <div className="flex flex-wrap gap-2">
              {article.relatedSkus.map((sku) => (
                <Link
                  key={`${sku.provider}-${sku.externalId}`}
                  href={`/product/${sku.provider}/${encodeURIComponent(sku.externalId)}`}
                  className={`text-[13px] border px-2.5 py-1 ${paper ? "border-[#ccc6b8]" : "border-surface-700"} ${ink}`}
                >
                  {sku.name}
                </Link>
              ))}
            </div>
          </aside>
        )}
      </div>
    </article>
  );
}

function BrandSpaceLinks({
  hubPath,
  brandName,
  paper,
}: {
  hubPath: string;
  brandName: string;
  paper?: boolean;
}) {
  const own = hubPath === "/marca";
  const links = own
    ? [
        { href: "/marca/productos", label: "Semáforo y productos" },
        { href: "/marca/acciones", label: "Acciones" },
        { href: "/noticias", label: "Novedades" },
        { href: "/marca/landing", label: "Espacio" },
      ]
    : [
        { href: `${hubPath}#productos`, label: "Productos y semáforo" },
        { href: `${hubPath}#acciones`, label: "Acciones" },
        { href: `${hubPath}#novedades`, label: "Novedades" },
        { href: hubPath, label: `Espacio de ${brandName}` },
      ];
  return (
    <nav className={`flex flex-wrap gap-2 mb-8 ${paper ? "" : ""}`}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`text-[12px] font-semibold rounded-full px-3 py-1.5 border ${
            paper ? "border-[#ccc6b8] text-[#111] hover:bg-black/5" : "border-surface-700 text-white hover:bg-surface-800"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
