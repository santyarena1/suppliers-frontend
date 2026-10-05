"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

export type CodeSample = { lang: string; label: string; code: string };

const STORE_KEY = "nodo.docs.lang";
const LANG_EVENT = "nodo:docs-lang";

/** Lenguaje elegido: se recuerda y se sincroniza entre todos los bloques de la página. */
function useDocsLang(available: string[]): [string, (l: string) => void] {
  const [lang, setLang] = useState(available[0]);
  const key = available.join("|");
  useEffect(() => {
    const options = key.split("|");
    const read = () => {
      try {
        const saved = localStorage.getItem(STORE_KEY);
        if (saved && options.includes(saved)) setLang(saved);
      } catch {
        /* sin storage, queda el primero */
      }
    };
    read();
    window.addEventListener(LANG_EVENT, read);
    return () => window.removeEventListener(LANG_EVENT, read);
  }, [key]);
  const choose = (l: string) => {
    setLang(l);
    try {
      localStorage.setItem(STORE_KEY, l);
    } catch {
      /* ignorar */
    }
    window.dispatchEvent(new Event(LANG_EVENT));
  };
  return [lang, choose];
}

/** Bloque de código con pestañas por lenguaje y botón de copiar. */
export function CodeTabs({ samples, title }: { samples: CodeSample[]; title?: string }) {
  const langs = samples.map((s) => s.lang);
  const [lang, setLang] = useDocsLang(langs);
  const current = samples.find((s) => s.lang === lang) ?? samples[0];
  return (
    <div className="dv-code">
      <div className="dv-code__bar">
        {title && <span className="dv-code__title">{title}</span>}
        {samples.length > 1 && (
          <div className="dv-code__tabs" role="tablist">
            {samples.map((s) => (
              <button
                key={s.lang}
                type="button"
                role="tab"
                aria-selected={s.lang === current.lang}
                onClick={() => setLang(s.lang)}
                className="dv-code__tab"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <CopyCode text={current.code} />
      </div>
      <pre className="dv-code__pre">
        <code>{current.code}</code>
      </pre>
    </div>
  );
}

/** Bloque de un solo lenguaje (respuestas JSON, headers). */
export function CodeBlock({ code, title }: { code: string; title?: string }) {
  return (
    <div className="dv-code">
      <div className="dv-code__bar">
        {title && <span className="dv-code__title">{title}</span>}
        <CopyCode text={code} />
      </div>
      <pre className="dv-code__pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function CopyCode({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="dv-code__copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* sin portapapeles */
        }
      }}
      aria-label="Copiar código"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{done ? "Copiado" : "Copiar"}</span>
    </button>
  );
}
