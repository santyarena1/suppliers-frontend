"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PrefsPanel from "@/components/PrefsPanel";
import { brandApi, type OrgNotice } from "@/lib/api";
import { Bell, Loader2 } from "lucide-react";

function errMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

export default function AvisosPage() {
  const [items, setItems] = useState<OrgNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await brandApi.notifications();
    setItems(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setAviso(errMsg(err, "No se pudieron cargar los avisos"));
      setLoading(false);
    });
  }, [load]);

  async function mark(id: string) {
    await brandApi.markRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
  }

  return (
    <>
      <header className="flex-shrink-0 border-b border-surface-800 bg-surface-950 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Avisos</h1>
          <p className="text-xs text-surface-500 hidden sm:block">
            Lo que te mandan las organizaciones vinculadas. No cruza con otras cuentas.
          </p>
        </div>
        <PrefsPanel />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-3">
          {aviso && <p className="text-xs rounded-md px-3 py-2 bg-red-500/10 text-red-400">{aviso}</p>}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16">
              <Bell className="w-10 h-10 text-surface-600 mx-auto mb-3" />
              <p className="text-sm text-surface-400">No hay avisos todavía.</p>
            </div>
          ) : (
            items.map((n) => (
              <article
                key={n.id}
                className={`border rounded-xl p-4 ${n.readAt ? "border-surface-800 bg-surface-900" : "border-brand-500/30 bg-brand-500/5"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{n.title}</p>
                    <p className="text-[11px] text-surface-500 mt-0.5">
                      {n.fromTenant?.name ?? "NODO"} · {new Date(n.createdAt).toLocaleString("es-AR")}
                    </p>
                  </div>
                  {!n.readAt && (
                    <button onClick={() => mark(n.id)} className="text-[11px] text-brand-400 flex-shrink-0">
                      Marcar leído
                    </button>
                  )}
                </div>
                <p className="text-xs text-surface-300 mt-2 whitespace-pre-wrap">{n.body}</p>
                {n.kind === "NEWS" && n.landingKey && (
                  <a href={`/n/${n.landingKey}`} target="_blank" rel="noreferrer" className="inline-block mt-2 text-[11px] text-brand-400">
                    Leer la nota
                  </a>
                )}
                {n.kind === "NEWS" && !n.landingKey && (
                  <Link href="/noticias" className="inline-block mt-2 text-[11px] text-brand-400">
                    Ir a Noticias
                  </Link>
                )}
                {n.kind !== "NEWS" && n.landingKey && (
                  <a href={`/m/${n.landingKey}`} target="_blank" rel="noreferrer" className="inline-block mt-2 text-[11px] text-brand-400">
                    Ver landing
                  </a>
                )}
                <Link href="/marcas" className="inline-block mt-2 ml-3 text-[11px] text-surface-400">
                  Ir a marcas
                </Link>
              </article>
            ))
          )}
        </div>
      </div>
    </>
  );
}
