"use client";

import type { TgsPageMeta } from "@/lib/tgs-api";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  meta: TgsPageMeta | null;
  onPage: (page: number) => void;
}

export default function TgsPager({ meta, onPage }: Props) {
  if (!meta || meta.total_pages <= 1) return null;
  const page = meta.page;
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-surface-400">
      <span>
        {meta.total.toLocaleString("es-AR")} resultados · página {page} de {meta.total_pages}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="p-1.5 rounded-md border border-surface-700 disabled:opacity-30 hover:bg-surface-800"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={page >= meta.total_pages}
          onClick={() => onPage(page + 1)}
          className="p-1.5 rounded-md border border-surface-700 disabled:opacity-30 hover:bg-surface-800"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
