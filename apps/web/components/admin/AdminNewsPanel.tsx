"use client";

import { useEffect, useState } from "react";
import { adminNewsApi, type NewsCard } from "@/lib/api";
import { NEWS_KIND_LABELS } from "@/lib/news";
import { Loader2, Newspaper } from "lucide-react";

function statusLabel(status?: string) {
  if (status === "PUBLISHED") return "Publicada";
  if (status === "ARCHIVED") return "Archivada";
  return "Borrador";
}

export default function AdminNewsPanel({ showToast }: { showToast: (msg: string, ok?: boolean) => void }) {
  const [items, setItems] = useState<NewsCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await adminNewsApi.list();
    setItems(res.data.items);
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => {
      showToast("No se pudieron cargar las notas", false);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(item: NewsCard) {
    if (!window.confirm(`¿Borrar “${item.title}” de ${item.author.name}?`)) return;
    setBusyId(item.id);
    try {
      await adminNewsApi.remove(item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      showToast("Nota eliminada");
    } catch {
      showToast("No se pudo borrar la nota", false);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center gap-2">
        <Newspaper className="w-4 h-4 text-brand-400" />
        <p className="text-sm text-surface-300">
          Todas las notas de la red. Podés borrar una sin entrar como la organización.
        </p>
      </div>
      <div className="border border-surface-800 rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <p className="text-sm text-surface-500 px-4 py-8">Todavía no hay notas.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="px-4 py-3 border-t border-surface-800 first:border-t-0 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm text-white">{item.title}</p>
                <p className="text-[11px] text-surface-500">
                  {item.author.name} · {NEWS_KIND_LABELS[item.kind]} · {statusLabel(item.status)}
                  {item.isPublic ? " · pública" : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => void remove(item)}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {busyId === item.id ? "Borrando…" : "Eliminar"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
