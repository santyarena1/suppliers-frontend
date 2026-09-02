"use client";

import BrandHtmlCanvas from "@/components/org/BrandHtmlCanvas";
import { looksLikeDocumentHtml } from "@/lib/news";

export default function NewsHtmlBody({ html, paper }: { html: string; paper?: boolean }) {
  if (!html?.trim()) return null;
  if (looksLikeDocumentHtml(html)) {
    return (
      <div className={paper ? "bg-[#f4f1ea]" : "bg-white"}>
        <BrandHtmlCanvas html={html} minHeight={240} />
      </div>
    );
  }
  return (
    <div
      className={`news-prose ${paper ? "news-paper" : ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
