"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { inferBrandHubTarget, rewriteCssForBrandHost, scrollToBrandSection, appendMissingLandingSlots } from "@/lib/brand-html-nav";

const HOST_CSS = `:host{all:initial;display:block;position:relative;isolation:isolate;overflow:visible;width:100%;min-height:0;height:auto;color-scheme:light;background:#fff;color:#0f172a;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.45;}*,*::before,*::after{box-sizing:border-box;}img,video,svg{max-width:100%;height:auto;}a{color:inherit;cursor:pointer;}button{cursor:pointer;font:inherit;}::slotted(.brand-html-slot){display:block;color-scheme:light;color:#0f172a;background:transparent;}.nodo-landing-modules{background:transparent;color:#0f172a;padding:36px 16px 64px;display:flex;flex-direction:column;gap:28px;}.nodo-landing-modules>slot{display:block;}`;

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

function rewriteStyleTags(html: string): string {
  return html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => `<style>${rewriteCssForBrandHost(css)}</style>`);
}

function rewriteInlineStyles(html: string): string {
  return html.replace(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (_, _quoted: string, d?: string, s?: string) => {
    const css = rewriteCssForBrandHost(d ?? s ?? "");
    return css ? `style="${css.replace(/"/g, "&quot;")}"` : "";
  });
}

/**
 * El HTML de la marca es el cuerpo de la landing: los módulos van en los huecos
 * o se agregan al final del mismo documento (nunca una segunda página abajo).
 */
export default function BrandHtmlCanvas({
  html,
  slots,
  minHeight = 0,
}: {
  html: string;
  slots?: Partial<Record<string, ReactNode>>;
  minHeight?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const compiledBase = rewriteInlineStyles(rewriteStyleTags(compileSlots(stripActiveHtml(html ?? ""))));
  const compiled = slots ? appendMissingLandingSlots(compiledBase) : compiledBase;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.innerHTML = compiled.trim() ? `<style>${HOST_CSS}</style>${compiled}` : "";

    function onClick(e: Event) {
      const event = e as MouseEvent;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const node = path.find((n): n is Element => n instanceof Element && (n.tagName === "A" || n.tagName === "BUTTON"));
      if (!node) return;
      if (node.getRootNode() !== shadow) return;
      const href = node.getAttribute("href");
      const target = inferBrandHubTarget(node.textContent ?? "", href);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      scrollToBrandSection(target);
    }

    shadow.addEventListener("click", onClick);
    return () => shadow.removeEventListener("click", onClick);
  }, [compiled]);

  if (!compiled.trim()) return null;

  return (
    <div
      ref={hostRef}
      className="brand-html-host w-full bg-white text-slate-900"
      style={minHeight ? { minHeight } : undefined}
    >
      {Object.entries(slots ?? {}).map(([name, node]) =>
        node ? (
          <div key={name} slot={name} className="brand-html-slot text-slate-900 bg-transparent">
            {node}
          </div>
        ) : null
      )}
    </div>
  );
}

export function BrandHtmlSlotHole({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => scrollToBrandSection(labelToHash(label))}
      style={{
        border: "1px dashed #94a3b8",
        background: "#f8fafc",
        color: "#0f172a",
        borderRadius: 12,
        padding: "12px 14px",
        font: "600 13px/1.4 system-ui,sans-serif",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
      }}
    >
      Ver {label} en la landing ↓
    </button>
  );
}

function labelToHash(label: string) {
  const t = label.toLowerCase();
  if (t.includes("producto") || t.includes("semáforo") || t.includes("semaforo") || t.includes("mapa")) return "#productos";
  if (t.includes("accion")) return "#acciones";
  if (t.includes("noved") || t.includes("noticia")) return "#novedades";
  if (t.includes("material")) return "#materiales";
  if (t.includes("capacit")) return "#capacitaciones";
  if (t.includes("hablar") || t.includes("contacto")) return "#contacto";
  return "#productos";
}
