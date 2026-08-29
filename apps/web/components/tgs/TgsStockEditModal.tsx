"use client";

import { useEffect } from "react";
import TgsEntityForm from "./TgsEntityForm";
import { tgsApi, type TgsStockItem } from "@/lib/tgs-api";
import { STOCK_FIELDS } from "@/lib/tgs-forms";

interface Props {
  item: TgsStockItem;
  onClose: () => void;
  onSaved: (item: TgsStockItem) => void;
}

export default function TgsStockEditModal({ item, onClose, onSaved }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-surface-700 bg-surface-900 p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">Editar producto</h2>
            <p className="text-[11px] text-surface-500 mt-0.5">SKU {item.sku}</p>
          </div>
          <button type="button" className="text-xs text-surface-400 hover:text-white" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <TgsEntityForm
          fields={STOCK_FIELDS}
          initial={item as unknown as Record<string, unknown>}
          submitLabel="Guardar"
          onSubmit={async (body) => {
            const res = await tgsApi.patchStock(item.id, body);
            onSaved(res.data);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
