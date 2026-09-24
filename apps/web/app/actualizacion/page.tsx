"use client";

import SystemUnavailable from "@/components/system/SystemUnavailable";

/**
 * Modo mantenimiento planificado.
 * Activar con MAINTENANCE_MODE=1 (o true) en el entorno del front:
 * el middleware manda todo el tráfico acá.
 */
export default function ActualizacionPage() {
  return (
    <SystemUnavailable
      variant="maintenance"
      brandAsText
      onRetry={() => {
        window.location.reload();
      }}
      retryLabel="Probar de nuevo"
    />
  );
}
