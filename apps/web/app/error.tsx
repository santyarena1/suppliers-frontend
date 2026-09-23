"use client";

import { useEffect } from "react";
import SystemUnavailable from "@/components/system/SystemUnavailable";

/**
 * Error de un segmento bajo el layout raíz. Da feedback claro en vez de
 * una pantalla en blanco o el overlay genérico de Next.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[NODO] error de ruta", error);
  }, [error]);

  return (
    <SystemUnavailable
      variant="error"
      brandAsText
      onRetry={reset}
      retryLabel="Reintentar"
    />
  );
}
