"use client";

import { useEffect } from "react";
import { archivo, chivoMono } from "./(marketing)/fonts";
import SystemUnavailable from "@/components/system/SystemUnavailable";
import "./globals.css";
import "./(marketing)/landing.css";
import "./system-status.css";

/**
 * Falla el layout raíz. Next reemplaza todo el documento: hay que
 * volver a montar html/body y las tipografías de marca.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[NODO] error global", error);
  }, [error]);

  return (
    <html
      lang="es"
      className={`h-dvh ${archivo.variable} ${chivoMono.variable}`}
      data-theme="soft"
    >
      <body className="h-dvh">
        <SystemUnavailable
          variant="error"
          brandAsText
          onRetry={reset}
          retryLabel="Reintentar"
        />
      </body>
    </html>
  );
}
