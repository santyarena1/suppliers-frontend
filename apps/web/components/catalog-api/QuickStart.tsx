"use client";

import { useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { CopyButton } from "./ui";

type Lang = "curl" | "js" | "python";

function snippets(baseUrl: string, publicKey: string): Record<Lang, string> {
  const key = publicKey || "nodo_pk_…";
  return {
    curl: `curl "${baseUrl}/v1/products?limit=20&inStock=true" \\
  -H "X-Api-Key: ${key}" \\
  -H "X-Api-Secret: $NODO_API_SECRET"`,
    js: `const res = await fetch("${baseUrl}/v1/products?limit=20&inStock=true", {
  headers: {
    "X-Api-Key": "${key}",
    "X-Api-Secret": process.env.NODO_API_SECRET,
  },
});
const { data, pagination } = await res.json();`,
    python: `import os, requests

res = requests.get(
    "${baseUrl}/v1/products",
    params={"limit": 20, "inStock": "true"},
    headers={"X-Api-Key": "${key}", "X-Api-Secret": os.environ["NODO_API_SECRET"]},
)
data = res.json()["data"]`,
  };
}

/** Primer pedido con la base URL real y la key elegida. */
export default function QuickStart({ baseUrl, docsUrl, publicKey }: { baseUrl: string; docsUrl: string; publicKey?: string }) {
  const [lang, setLang] = useState<Lang>("curl");
  const code = snippets(baseUrl.replace(/\/$/, ""), publicKey ?? "")[lang];
  return (
    <section className="rounded-xl border border-surface-800 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Inicio rápido</h2>
          <p className="mt-1 text-xs text-surface-400">
            Base URL <code className="text-surface-200">{baseUrl}</code>. El secret va en una variable de entorno, nunca en el código del navegador.
          </p>
        </div>
        <a href={docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-300 hover:text-brand-200">
          <BookOpen className="w-3.5 h-3.5" /> Documentación completa <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-surface-800 bg-surface-950">
        <div className="flex items-center justify-between border-b border-surface-800 px-2">
          <div className="flex" role="tablist">
            {(["curl", "js", "python"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={lang === l}
                onClick={() => setLang(l)}
                className={`px-2.5 py-2 text-[11px] font-medium border-b-2 -mb-px ${lang === l ? "border-brand-500 text-white" : "border-transparent text-surface-500 hover:text-white"}`}
              >
                {l === "curl" ? "cURL" : l === "js" ? "JavaScript" : "Python"}
              </button>
            ))}
          </div>
          <CopyButton text={code} />
        </div>
        <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed text-surface-200 font-mono">{code}</pre>
      </div>
    </section>
  );
}
