"use client";

import { useEffect, useRef, type ReactNode } from "react";

const HOST_CSS = `:host{all:initial;display:block;width:100%;min-height:inherit;color-scheme:light;background:#fff;color:#111;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.45;}*,*::before,*::after{box-sizing:border-box;}img,video,svg{max-width:100%;height:auto;}a{color:inherit;}::slotted(.brand-html-slot){display:block;color-scheme:dark;}`;

function compileSlots(html: string): string {
  return html
    .replace(/<div\s+data-nodo-slot="([a-z]+)"\s*><\/div>/gi, `<slot name="$1"></slot>`)
    .replace(/\{\{\s*([a-z]+)\s*\}\}/gi, `<slot name="$1"></slot>`);
}

function stripActiveHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*>/gi, "")
    .replace(/<(iframe|object|embed|form)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function rewriteCssForShadow(css: string): string {
  return css
    .replace(/:root\b/g, ":host")
    .replace(/(^|[,+>~({\s])\s*(html|body)\b/gi, "$1:host");
}

function rewriteStyleTags(html: string): string {
  return html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => `<style>${rewriteCssForShadow(css)}</style>`);
}

/**
 * El HTML de la marca va por encima de la identidad de Nodo.
 * Shadow DOM con `:host { all: initial }`: su CSS manda y el tema de Nodo no lo pisa.
 * Los huecos `{{productos}}` son `<slot>` nativos: los módulos de Nodo quedan en light DOM (Tailwind sí aplica).
 */
export default function BrandHtmlCanvas({
  html,
  slots,
  minHeight = 320,
}: {
  html: string;
  slots?: Partial<Record<string, ReactNode>>;
  minHeight?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const compiled = rewriteStyleTags(compileSlots(stripActiveHtml(html ?? "")));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.innerHTML = compiled.trim() ? `<style>${HOST_CSS}</style>${compiled}` : "";
  }, [compiled]);

  if (!compiled.trim()) return null;

  return (
    <div ref={hostRef} className="brand-html-host w-full bg-white" style={{ minHeight }}>
      {Object.entries(slots ?? {}).map(([name, node]) =>
        node ? (
          <div key={name} slot={name} className="brand-html-slot">
            {node}
          </div>
        ) : null
      )}
    </div>
  );
}

export function BrandHtmlSlotHole({ label }: { label: string }) {
  return (
    <div
      style={{
        border: "1px dashed #94a3b8",
        background: "#f8fafc",
        color: "#475569",
        borderRadius: 12,
        padding: "16px 14px",
        font: "12px/1.4 system-ui,sans-serif",
      }}
    >
      Hueco de NODO: {label}
    </div>
  );
}
