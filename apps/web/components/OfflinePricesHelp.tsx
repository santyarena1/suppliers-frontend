"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

export function OfflinePricesHelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-surface-500 hover:text-white p-0.5"
        title="Qué son los precios offline"
        aria-label="Qué son los precios offline"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && <OfflinePricesHelpModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function OfflinePricesHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-900 border border-surface-700 rounded-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-white">Precios offline</h3>
          <button type="button" onClick={onClose} className="text-surface-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="text-sm text-surface-300 space-y-2 leading-relaxed">
          <p>
            El <span className="text-white font-medium">pedido offline</span> es una compra sin facturar (lo que antes se llamaba “.com”).
          </p>
          <p>
            Si el distribuidor la acepta, el precio se recalcula según el tratamiento de IVA que configuraste: descontar el IVA, dejar la mitad, o normalizar todos a 10,5%. Internos y percepciones no se tocan.
          </p>
          <p>
            El pedido offline no se carga en el portal: se arma un mensaje para mandarle al vendedor.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full bg-surface-800 hover:bg-surface-700 text-white text-sm font-medium rounded-lg py-2"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
