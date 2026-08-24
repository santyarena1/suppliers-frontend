"use client";

import { useState } from "react";
import { useCart, type CartScheme } from "@/lib/cart";
import { X, Plus } from "lucide-react";

export function SchemePicker({
  provider,
  onPick,
  onClose,
}: {
  provider: string;
  onPick: (scheme: CartScheme) => void;
  onClose: () => void;
}) {
  const { schemesFor, createScheme } = useCart();
  const schemes = schemesFor(provider);
  const [name, setName] = useState("");

  function create() {
    const scheme = createScheme(provider, name.trim() || undefined);
    onPick(scheme);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-900 border border-surface-700 rounded-xl max-w-sm w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Agregar a un esquema</h3>
            <p className="text-xs text-surface-500 mt-1">
              El agrupado es solo para vos. Al portal el ítem va suelto; el vendedor ve el esquema en el mensaje.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-surface-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {schemes.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-4">
            {schemes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s)}
                className="text-left text-sm text-surface-200 hover:text-white bg-surface-800 hover:bg-surface-700 rounded-lg px-3 py-2"
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={schemes.length ? "Nuevo esquema…" : "Esquema 1"}
            className="flex-1 bg-surface-800 border border-surface-700 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={create}
            className="flex items-center gap-1 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-lg px-3"
          >
            <Plus className="w-3.5 h-3.5" />
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}
