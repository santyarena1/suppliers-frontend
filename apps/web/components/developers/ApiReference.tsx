"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { API_BASE } from "./docs-content";

/** Versión fija de Scalar: una actualización no puede romper la referencia sin que la probemos. */
const SCALAR_SRC = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.0";

type ScalarGlobal = { createApiReference: (el: HTMLElement | string, config: Record<string, unknown>) => unknown };

/** Referencia interactiva generada desde /v1/openapi.json (Scalar). */
export function ApiReference() {
  const mount = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loaded || !mount.current) return;
    const scalar = (window as unknown as { Scalar?: ScalarGlobal }).Scalar;
    if (!scalar) {
      setFailed(true);
      return;
    }
    scalar.createApiReference(mount.current, {
      url: `${API_BASE}/v1/openapi.json`,
      theme: "purple",
      darkMode: true,
      forceDarkModeState: "dark",
      hideDarkModeToggle: true,
      hideClientButton: false,
      // Sin la barra ni el chat de IA de Scalar: la referencia es nuestra.
      showToolbar: "never",
      showDeveloperTools: "never",
      agent: { disabled: true },
      customCss: `.dark-mode {
        --scalar-background-1: #0b0d1a;
        --scalar-background-2: #0f1226;
        --scalar-background-3: #1a1d3a;
        --scalar-color-accent: #9d9fff;
        --scalar-border-color: rgb(191 210 255 / 0.12);
      }`,
      defaultHttpClient: { targetKey: "shell", clientKey: "curl" },
      metaData: { title: "API de catálogo de NODO" },
    });
  }, [loaded]);

  return (
    <>
      <Script src={SCALAR_SRC} strategy="afterInteractive" onReady={() => setLoaded(true)} onError={() => setFailed(true)} />
      {failed && (
        <p className="nl-shell py-16 text-center text-[var(--fg-2)]">
          No se pudo cargar la referencia interactiva. Podés descargar la especificación en{" "}
          <a className="text-[var(--accent-2)] underline" href={`${API_BASE}/v1/openapi.json`}>
            /v1/openapi.json
          </a>
          .
        </p>
      )}
      {!loaded && !failed && <p className="nl-shell py-16 text-center text-[var(--fg-3)]">Cargando la referencia…</p>}
      <div ref={mount} className="min-h-[70dvh]" />
    </>
  );
}
