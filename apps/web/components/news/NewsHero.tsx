"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adsApi, type NewsHeroSlide } from "@/lib/api";
import NewsByline from "./NewsByline";
import NewsKindMark from "./NewsKindMark";
import NewsPhoto from "./NewsPhoto";

export default function NewsHero({ slides }: { slides: NewsHeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), 7000);
    return () => window.clearInterval(t);
  }, [slides.length, paused]);

  useEffect(() => {
    const slide = slides[index];
    if (!slide?.campaignId) return;
    void adsApi.track(slide.campaignId, "impression", "/noticias");
  }, [index, slides]);

  if (slides.length === 0) return null;
  const current = slides[index];

  return (
    <section
      className="relative bg-black"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative min-h-[58vh] md:min-h-[72vh]">
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-700 ${i === index ? "opacity-100" : "opacity-0"}`}
          >
            <NewsPhoto src={slide.coverUrl} alt={slide.title} className="absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
          </div>
        ))}

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-8 pt-28 pb-14 md:pt-40 md:pb-16 flex flex-col justify-end min-h-[58vh] md:min-h-[72vh]">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/55 mb-3">Destacada</p>
          <NewsKindMark kind={current.kind} light />
          <h2 className="news-serif text-4xl sm:text-5xl md:text-6xl font-semibold text-white tracking-tight text-balance max-w-3xl mt-2 leading-[1.05]">
            <Link
              href={`/noticias/${current.id}`}
              onClick={() => void adsApi.track(current.campaignId, "click", "/noticias")}
              className="hover:opacity-90"
            >
              {current.title}
            </Link>
          </h2>
          {current.excerpt && (
            <p className="mt-4 text-[17px] text-white/75 max-w-xl leading-relaxed">{current.excerpt}</p>
          )}
          <NewsByline author={current.author} date={current.publishedAt} advertised />
        </div>
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-5 right-5 z-10 flex gap-1.5">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Ir a ${slide.title}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-8 bg-white" : "w-1.5 bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
