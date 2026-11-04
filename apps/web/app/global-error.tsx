"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/clientErrors";

/** Último recurso: se rompió hasta el armado general de la página. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#0b0d10", color: "#e5e7eb", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "64px 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>NODO tuvo un error</h1>
          <p style={{ fontSize: 14, color: "#9ca3af" }}>Ya nos llegó el aviso. Tu carrito no se perdió.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, height: 36, padding: "0 16px", borderRadius: 6, border: 0, background: "#2563eb", color: "#fff", fontSize: 14 }}
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
