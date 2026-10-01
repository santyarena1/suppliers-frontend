"use client";

import { useEffect, useState } from "react";
import BrandHtmlCanvas from "@/components/org/BrandHtmlCanvas";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { looksLikeDocumentHtml } from "@/lib/news";

export default function NewsHtmlBody({ html, paper }: { html: string; paper?: boolean }) {
  // El HTML se limpia en el navegador (DOMPurify necesita el DOM).
  const [clean, setClean] = useState("");
  useEffect(() => {
    setClean(sanitizeRichHtml(html ?? ""));
  }, [html]);
  if (!html?.trim()) return null;
  if (looksLikeDocumentHtml(html)) {
    return (
      <div className={paper ? "bg-[#f4f1ea]" : "bg-white"}>
        <BrandHtmlCanvas html={html} />
      </div>
    );
  }
  return (
    <div
      className={`news-prose ${paper ? "news-paper" : ""}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
