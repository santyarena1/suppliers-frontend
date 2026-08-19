"use client";

import { useEffect, useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { isMockActive, MOCK_EVENT } from "./with-fallback";

/**
 * Banner visible cuando alguna llamada del módulo Marcas usó datos hardcodeados.
 * Eliminar junto con la carpeta _dev-fallback/ cuando el backend esté listo.
 */
export default function MockFallbackBanner() {
  const [active, setActive] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const sync = () => setActive(isMockActive());
    sync();
    window.addEventListener(MOCK_EVENT, sync);
    return () => window.removeEventListener(MOCK_EVENT, sync);
  }, []);

  if (!active || dismissed) return null;

  return (
    <div className="flex-shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 flex items-center gap-3 text-xs text-amber-200">
      <FlaskConical className="w-4 h-4 text-amber-400 flex-shrink-0" />
      <p className="flex-1">
        <span className="font-medium text-amber-300">Modo demo</span>
        {" — "}El backend no respondió; se muestran datos hardcodeados de{" "}
        <code className="text-amber-400/90">lib/brands/_dev-fallback/</code>.
        Cuando el API esté listo, desaparece automáticamente.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-400/70 hover:text-amber-300 p-1"
        title="Ocultar aviso"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
