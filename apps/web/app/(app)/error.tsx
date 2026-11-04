"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/clientErrors";

/**
 * Si una pantalla se rompe, queda el menú y se puede reintentar sin perder el
 * carrito (vive en el servidor y en este navegador). El error se informa.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-surface-100">Esta pantalla tuvo un error</h1>
      <p className="mt-2 text-sm text-surface-400">
        Ya nos llegó el aviso. Tu carrito no se perdió. Probá de nuevo; si sigue, recargá la página.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="h-9 rounded-md bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-400"
        >
          Reintentar
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-9 rounded-md border border-surface-700 px-4 text-sm text-surface-200 hover:bg-surface-800"
        >
          Recargar
        </button>
      </div>
    </div>
  );
}
